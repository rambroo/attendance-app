import AsyncStorage from '@react-native-async-storage/async-storage';
import { encode as base64Encode } from 'base-64';
import axios from 'axios';

const AUTH_KEYS = [
  'authToken', 'apiKey', 'authMethod',
  'userEmail', 'userName', 'isLoggedIn',
  'sessionId', 'employeeId', 'employeeName',
  'department', 'designation',
];

const getSiteBase = async () => {
  const url = await AsyncStorage.getItem('siteUrl');
  if (!url) throw new Error('No site configured.');
  return url; // e.g. https://company.erpnext.com
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
      if (data.sid) await AsyncStorage.setItem('sessionId', data.sid);
      return { success: true, fullName: data.full_name, email };
    }

    throw new Error('Login failed — unexpected response');
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    if (error.response?.status === 401 || error.response?.data?.exc) {
      throw new Error('Invalid email or password. Please try again.');
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      throw new Error('Cannot connect to server. Check your network or site URL.');
    }
    throw new Error(error.message || 'Login failed. Please check your credentials.');
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
        await axios.post(`${base}/api/method/logout`, {}, {
          headers: { Cookie: `sid=${sid}` },
        });
      } catch { /* ignore server-side logout errors */ }
    }
    await AsyncStorage.multiRemove(AUTH_KEYS);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

export const isAuthenticated = async () => {
  try {
    const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
    const authMethod = await AsyncStorage.getItem('authMethod');
    if (authMethod === 'api_key') {
      const token = await AsyncStorage.getItem('authToken');
      return isLoggedIn === 'true' && !!token;
    } else if (authMethod === 'password') {
      const sid = await AsyncStorage.getItem('sessionId');
      return isLoggedIn === 'true' && !!sid;
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
