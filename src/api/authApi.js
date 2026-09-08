import AsyncStorage from '@react-native-async-storage/async-storage';
import { encode as base64Encode } from 'base-64';
import axios from 'axios';
import { getSecret, setSecret, deleteSecret } from '../utils/secureStore';
import { resetServerCaps } from '../utils/serverCaps';

const AUTH_KEYS = [
  'authToken', 'apiKey', 'authMethod',
  'userEmail', 'userName', 'isLoggedIn',
  'sessionId', 'employeeId', 'employeeName',
  'department', 'designation',
];

// Stored in SecureStore (Keystore-backed), not AsyncStorage
const CRED_KEYS = ['savedEmail', 'savedPassword'];

// Removes saved login credentials from secure storage (and any plaintext
// copies left behind by pre-1.1.0 builds).
export const clearSavedCredentials = async () => {
  await Promise.all(CRED_KEYS.map(deleteSecret));
};

const getSiteBase = async () => {
  const url = await AsyncStorage.getItem('siteUrl');
  if (!url) throw new Error('No site configured.');
  return url;
};

export const loginWithPassword = async (email, password) => {
  try {
    const base = await getSiteBase();
    const response = await axios.post(
      `${base}/api/method/login`,
      `usr=${encodeURIComponent(email)}&pwd=${encodeURIComponent(password)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      }
    );

    const data = response.data;
    if (data.message === 'Logged In' || data.full_name) {
      await AsyncStorage.multiSet([
        ['authMethod', 'password'],
        ['userEmail',  email],
        ['userName',   data.full_name || email],
        ['isLoggedIn', 'true'],
      ]);
      // Credentials go to SecureStore so silent re-login can work
      await Promise.all([
        setSecret('savedEmail', email),
        setSecret('savedPassword', password),
      ]);
      // Frappe's /api/method/login returns only { message, home_page, full_name }.
      // The `sid` is set as an httpOnly Set-Cookie header and is NOT in the body,
      // so this almost never fires — it is kept only for sites/proxies that do
      // echo it back. Real session continuity comes from the native HTTP stack's
      // cookie jar, which persists the httpOnly sid automatically.
      if (data.sid) await AsyncStorage.setItem('sessionId', data.sid);
      // Re-probe what the site supports. Gives a deterministic way to pick up a
      // backend deploy ("log out and back in") instead of waiting for the TTL.
      await resetServerCaps();
      return { success: true, fullName: data.full_name, email };
    }

    throw new Error('Login failed — unexpected response');
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    if (error.response?.status === 401 || error.response?.data?.exc) {
      // Tagged so silentReLogin can tell "wrong password" (a real logout) from
      // "couldn't reach the server" (transient — keep the user where they are).
      const e = new Error('Invalid email or password. Please try again.');
      e.authFailed = true;
      throw e;
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      throw new Error('Cannot connect to server. Check your network or site URL.');
    }
    throw new Error(error.message || 'Login failed. Please check your credentials.');
  }
};

// Silently re-authenticates using saved credentials.
//
// Returns { ok, reason }. The reason matters: callers must not drop the user to
// the login screen just because the device was offline for a moment. Only
// 'no-credentials' and 'invalid-credentials' are real logout conditions.
export const silentReLogin = async () => {
  let email, password;
  try {
    [email, password] = await Promise.all([
      getSecret('savedEmail'),
      getSecret('savedPassword'),
    ]);
  } catch {
    return { ok: false, reason: 'no-credentials' };
  }
  if (!email || !password) return { ok: false, reason: 'no-credentials' };

  try {
    await loginWithPassword(email, password);
    return { ok: true, reason: 'success' };
  } catch (err) {
    // Anything that isn't an explicit credential rejection is treated as
    // transient, so a flaky connection never costs the user their session.
    return { ok: false, reason: err.authFailed ? 'invalid-credentials' : 'network' };
  }
};

export const loginWithApiKey = async (apiKey, apiSecret) => {
  try {
    const token = base64Encode(`${apiKey}:${apiSecret}`);
    await AsyncStorage.multiSet([
      ['authToken',  token],
      ['apiKey',     apiKey],
      ['authMethod', 'api_key'],
      ['isLoggedIn', 'true'],
    ]);
    return { success: true };
  } catch (error) {
    console.error('API Key login error:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    const authMethod = await AsyncStorage.getItem('authMethod');
    if (authMethod === 'password') {
      try {
        const [base, sid] = await Promise.all([
          getSiteBase(),
          AsyncStorage.getItem('sessionId'),
        ]);
        // Without a stored sid the cookie jar carries the real one; sending
        // "Cookie: sid=null" would just override it with garbage.
        await axios.post(`${base}/api/method/logout`, {}, {
          headers: sid ? { Cookie: `sid=${sid}` } : {},
        });
      } catch { /* ignore server-side logout errors */ }
    }
    await AsyncStorage.multiRemove(AUTH_KEYS);
    await clearSavedCredentials();
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

// Is there a usable session on this device?
//
// This must NOT require a network call. It runs on every cold start, and if it
// returns false the app drops to the login screen. It previously also required
// a stored `sessionId`, which Frappe never sends in the login body (see
// loginWithPassword) — so it returned false on every launch, forcing a full
// network re-login each time and logging the user out whenever that request
// failed. That was the "app randomly logs me out" complaint.
//
// A dead session is now detected where it actually shows up: on the first API
// call, via the session_expired flag in apiClient, which triggers silentReLogin.
export const isAuthenticated = async () => {
  try {
    const [isLoggedIn, authMethod] = await Promise.all([
      AsyncStorage.getItem('isLoggedIn'),
      AsyncStorage.getItem('authMethod'),
    ]);
    if (isLoggedIn !== 'true') return false;

    if (authMethod === 'api_key') {
      return !!(await AsyncStorage.getItem('authToken'));
    }
    if (authMethod === 'password') {
      // The sid lives in the native cookie jar, not here. If the cookie has
      // lapsed, the first API call reports it and silentReLogin recovers.
      return true;
    }
    return false;
  } catch { return false; }
};

export const getStoredUser = async () => {
  try {
    const [[, email], [, name]] = await AsyncStorage.multiGet(['userEmail', 'userName']);
    return { email, name };
  } catch { return { email: null, name: null }; }
};
