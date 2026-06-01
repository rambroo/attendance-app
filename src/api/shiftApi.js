import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { formatDate } from './attendanceApi';

const setCache = (key, data) => AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
const getCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const getShiftAssignments = async (employeeId) => {
  const CACHE_KEY = `shift_assignments_${employeeId}`;
  try {
    const today = formatDate(new Date());
    const response = await apiClient.get('/resource/Shift Assignment', {
      params: {
        filters: JSON.stringify([
          ['employee', '=', employeeId],
          ['docstatus', '=', 1],
        ]),
        fields: JSON.stringify([
          'name', 'shift_type', 'start_date', 'end_date',
          'employee_name', 'status',
        ]),
        order_by: 'start_date desc',
        limit: 20,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data);
    return data;
  } catch (error) {
    if (error.sessionExpired) throw error;
    const cached = await getCache(CACHE_KEY);
    return cached || [];
  }
};

export const getShiftTypes = async () => {
  const CACHE_KEY = 'shift_types';
  try {
    const response = await apiClient.get('/resource/Shift Type', {
      params: {
        fields: JSON.stringify(['name', 'start_time', 'end_time']),
        limit: 30,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data);
    return data;
  } catch {
    const cached = await getCache(CACHE_KEY);
    return cached || [];
  }
};

export const getShiftRequests = async (employeeId) => {
  const CACHE_KEY = `shift_requests_${employeeId}`;
  try {
    const response = await apiClient.get('/resource/Shift Request', {
      params: {
        filters: JSON.stringify([['employee', '=', employeeId]]),
        fields: JSON.stringify([
          'name', 'shift_type', 'from_date', 'to_date',
          'status', 'docstatus',
        ]),
        order_by: 'from_date desc',
        limit: 20,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data);
    return data;
  } catch (error) {
    if (error.sessionExpired) throw error;
    const cached = await getCache(CACHE_KEY);
    return cached || [];
  }
};

export const submitShiftRequest = async (employeeId, { shiftType, fromDate, toDate, reason }) => {
  const payload = {
    doctype:    'Shift Request',
    employee:   employeeId,
    shift_type: shiftType,
    from_date:  fromDate,
    to_date:    toDate,
    reason:     reason || '',
  };
  const response = await apiClient.post('/resource/Shift Request', payload);
  return response.data.data;
};
