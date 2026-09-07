import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// No static baseURL — it is resolved per-request from AsyncStorage
const apiClient = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    // Resolve site URL dynamically so any site can be connected
    const siteUrl = await AsyncStorage.getItem('siteUrl');
    config.baseURL = siteUrl ? `${siteUrl}/api` : '';

    const authMethod = await AsyncStorage.getItem('authMethod');
    if (authMethod === 'api_key') {
      const token = await AsyncStorage.getItem('authToken');
      if (token) config.headers.Authorization = `Basic ${token}`;
    } else if (authMethod === 'password') {
      const sid = await AsyncStorage.getItem('sessionId');
      if (sid) config.headers.Cookie = `sid=${sid}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Decide whether a failed response means "the session is gone", as opposed to
// "you are logged in but not allowed to do that".
//
// Frappe defines a SessionExpired exception but never raises it. An expired or
// invalid `sid` instead makes the request fall through as Guest, with
// `session_expired: 1` set on the response body (see frappe/sessions.py,
// get_session_record). The resulting status is a plain 403 PermissionError —
// indistinguishable from a real permission denial by status code alone, which
// is why we key on the flag and not on 403.
const isSessionExpired = (error) => {
  const res = error.response;
  if (!res) return false;

  const data = res.data || {};
  if (data.session_expired === 1 || data.session_expired === '1') return true;

  // Maintenance mode, or a session stopped by an administrator.
  if (res.status === 503 && data.exc_type === 'SessionStopped') return true;

  // API-key credentials rejected outright.
  if (res.status === 401) return true;

  return false;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response) {
      console.error('API Error:', error.response.status, JSON.stringify(error.response.data));
      // Flag only — the auth keys are deliberately left in place so that
      // silentReLogin() can run before we decide to show the login screen.
      if (isSessionExpired(error)) error.sessionExpired = true;
    } else if (error.request) {
      console.error('Network Error:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
