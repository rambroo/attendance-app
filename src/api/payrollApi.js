import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';

const setCache = (key, data) => AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
const getCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const clearSalaryCache = async (employeeId) => {
  await AsyncStorage.removeItem(`salary_slips_${employeeId}`).catch(() => {});
};

export const getSalarySlips = async (employeeId) => {
  const CACHE_KEY = `salary_slips_${employeeId}`;
  try {
    const response = await apiClient.get('/resource/Salary Slip', {
      params: {
        filters: JSON.stringify([
          ['employee', '=', employeeId],
          ['docstatus', '!=', 2],
        ]),
        fields: JSON.stringify([
          'name', 'start_date', 'end_date',
          'gross_pay', 'total_deduction', 'net_pay',
          'currency', 'docstatus',
        ]),
        order_by: 'start_date desc',
        limit: 24,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data);
    return data;
  } catch (error) {
    if (error.sessionExpired) throw error;
    const cached = await getCache(CACHE_KEY);
    if (cached) return cached;
    throw error;
  }
};

export const getSalarySlipDetail = async (slipName) => {
  const CACHE_KEY = `salary_detail_${slipName}`;
  try {
    const response = await apiClient.get(`/resource/Salary Slip/${encodeURIComponent(slipName)}`);
    const data = response.data.data;
    setCache(CACHE_KEY, data);
    return data;
  } catch (error) {
    if (error.sessionExpired) throw error;
    const cached = await getCache(CACHE_KEY);
    if (cached) return cached;
    throw error;
  }
};
