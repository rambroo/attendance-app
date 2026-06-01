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

export const getLeaveTypes = async () => {
  const CACHE_KEY = 'leave_types';
  try {
    // Step 1: get all leave type names
    const listResp = await apiClient.get('/resource/Leave Type', {
      params: { fields: JSON.stringify(['name']), limit: 50 },
    });
    const names = (listResp.data.data || []).map((r) => r.name);

    // Step 2: fetch each doc individually to get all fields including max_days_allowed
    const docs = await Promise.all(
      names.map((name) =>
        apiClient
          .get(`/resource/Leave Type/${encodeURIComponent(name)}`)
          .then((r) => r.data.data)
          .catch(() => ({ name }))
      )
    );

    setCache(CACHE_KEY, docs);
    return docs;
  } catch {
    const cached = await getCache(CACHE_KEY);
    return cached || [];
  }
};

// Try HRMS API method first, fall back to direct Leave Allocation query
export const getLeaveBalances = async (employeeId) => {
  const CACHE_KEY = `leave_bal_${employeeId}`;
  try {
    const today = formatDate(new Date());
    const response = await apiClient.get('/method/hrms.api.get_leave_balance_map', {
      params: { employee: employeeId, date: today },
    });
    const data = response.data.message || {};
    setCache(CACHE_KEY, data);
    return data;
  } catch {
    try {
      const today = formatDate(new Date());
      const response = await apiClient.get('/resource/Leave Allocation', {
        params: {
          filters: JSON.stringify([
            ['employee',  '=',  employeeId],
            ['docstatus', '=',  1],
            ['to_date',   '>=', today],
            ['from_date', '<=', today],
          ]),
          fields: JSON.stringify([
            'leave_type', 'total_leaves_allocated',
            'leaves_taken', 'carry_forwarded_leaves',
          ]),
          limit: 30,
        },
      });
      const allocs = response.data.data || [];
      const result = {};
      allocs.forEach((a) => {
        result[a.leave_type] = {
          total_leaves_allocated: a.total_leaves_allocated || 0,
          leaves_taken:           a.leaves_taken || 0,
          remaining:              (a.total_leaves_allocated || 0) - (a.leaves_taken || 0),
        };
      });
      setCache(CACHE_KEY, result);
      return result;
    } catch {
      const cached = await getCache(CACHE_KEY);
      return cached || {};
    }
  }
};

export const getLeaveApplications = async (employeeId) => {
  const CACHE_KEY = `leave_apps_${employeeId}`;
  try {
    const response = await apiClient.get('/resource/Leave Application', {
      params: {
        filters: JSON.stringify([['employee', '=', employeeId]]),
        fields: JSON.stringify([
          'name', 'leave_type', 'from_date', 'to_date',
          'total_leave_days', 'status', 'description',
          'half_day', 'docstatus',
        ]),
        order_by: 'from_date desc',
        limit: 50,
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

export const applyLeave = async (employeeId, { leaveType, fromDate, toDate, halfDay, reason }) => {
  const payload = {
    doctype:    'Leave Application',
    employee:   employeeId,
    leave_type: leaveType,
    from_date:  fromDate,
    to_date:    toDate,
    half_day:   halfDay ? 1 : 0,
    description: reason || '',
  };
  if (halfDay) payload.half_day_date = fromDate;
  const response = await apiClient.post('/resource/Leave Application', payload);
  return response.data.data;
};

// Try HRMS method first, fall back to employee holiday list → Holiday records
export const getHolidaysForEmployee = async (employeeId, year) => {
  const CACHE_KEY = `holidays_${employeeId}_${year}`;
  try {
    const response = await apiClient.get('/method/hrms.api.get_holidays_for_employee', {
      params: { employee: employeeId, year },
    });
    const data = response.data.message || [];
    setCache(CACHE_KEY, data);
    return data;
  } catch {
    try {
      const empResp = await apiClient.get(`/resource/Employee/${employeeId}`, {
        params: { fields: JSON.stringify(['holiday_list']) },
      });
      const holidayList = empResp.data.data?.holiday_list;
      if (!holidayList) return [];
      const holResp = await apiClient.get('/resource/Holiday', {
        params: {
          filters: JSON.stringify([
            ['parent',       '=',    holidayList],
            ['holiday_date', 'like', `${year}-%`],
          ]),
          fields:    JSON.stringify(['holiday_date', 'description', 'weekly_off']),
          order_by:  'holiday_date asc',
          limit:     100,
        },
      });
      const data = holResp.data.data || [];
      setCache(CACHE_KEY, data);
      return data;
    } catch {
      const cached = await getCache(CACHE_KEY);
      return cached || [];
    }
  }
};
