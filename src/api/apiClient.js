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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response) {
      console.error('API Error:', error.response.status, JSON.stringify(error.response.data));
      const excType = error.response.data?.exc_type;
      if (error.response.status === 503 && excType === 'SessionStopped') {
        await AsyncStorage.multiRemove([
          'authToken', 'apiKey', 'authMethod',
          'userEmail', 'userName', 'isLoggedIn', 'sessionId',
        ]);
        error.sessionExpired = true;
      }
    } else if (error.request) {
      console.error('Network Error:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
