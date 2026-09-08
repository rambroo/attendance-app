import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { hasPrivateSelfieSupport } from '../utils/serverCaps';

// ── Helpers ───────────────────────────────────────────────────────────────────

export const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDateTime = (date) => {
  const datePart = formatDate(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${datePart} ${hh}:${mm}:${ss}`;
};

export const formatTime = (datetimeStr) => {
  if (!datetimeStr) return '—';
  const date = new Date(datetimeStr);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const getNextPunchType = (checkins) => {
  if (!checkins || checkins.length === 0) return 'IN';
  return checkins[checkins.length - 1].log_type === 'IN' ? 'OUT' : 'IN';
};

export const calcWorkingHours = (checkins) => {
  let total = 0;
  const logs = [...checkins].sort((a, b) => new Date(a.time) - new Date(b.time));
  let i = 0;
  while (i < logs.length - 1) {
    if (logs[i].log_type === 'IN' && logs[i + 1].log_type === 'OUT') {
      total += (new Date(logs[i + 1].time) - new Date(logs[i].time)) / 3600000;
      i += 2;
    } else {
      i++;
    }
  }
  return total;
};

export const formatHours = (hours) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// ── Cache utilities ───────────────────────────────────────────────────────────

const setCache = (key, data) => AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
const getCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

function sessionExpiredError() {
  const e = new Error('Your session has expired. Please log in again.');
  e.sessionExpired = true;
  return e;
}

// ── Employee ──────────────────────────────────────────────────────────────────

export const getEmployeeByEmail = async (email) => {
  try {
    const response = await apiClient.get('/resource/Employee', {
      params: {
        filters: JSON.stringify([['user_id', '=', email]]),
        fields: JSON.stringify([
          'name', 'employee_name', 'department',
          'designation', 'company', 'image',
          'date_of_joining', 'status',
        ]),
        limit: 1,
      },
    });

    const employees = response.data.data || [];
    if (!employees.length) {
      throw new Error('No employee record linked to this user. Contact your HR administrator.');
    }

    const emp = employees[0];
    await AsyncStorage.multiSet([
      ['employeeId',   emp.name],
      ['employeeName', emp.employee_name || ''],
      ['department',   emp.department || ''],
      ['designation',  emp.designation || ''],
    ]);
    return emp;
  } catch (error) {
    if (error.sessionExpired) throw error;
    // Fall back to cache on network failure
    const cached = await getCachedEmployee();
    if (cached) return { ...cached, _cached: true };
    throw error;
  }
};

export const getCachedEmployee = async () => {
  const [empId, empName, dept, desig] = await AsyncStorage.multiGet([
    'employeeId', 'employeeName', 'department', 'designation',
  ]);
  if (!empId[1]) return null;
  return {
    name: empId[1],
    employee_name: empName[1],
    department: dept[1],
    designation: desig[1],
  };
};

// ── Employee Checkin ──────────────────────────────────────────────────────────

/** Returns cached checkins for today without any network call. */
export const getCachedTodayCheckins = async (employeeId) => {
  if (!employeeId) return null;
  const date = formatDate(new Date());
  return getCache(`checkins_${employeeId}_${date}`);
};

export const getTodayCheckins = async (employeeId, date) => {
  const CACHE_KEY = `checkins_${employeeId}_${date}`;
  try {
    const response = await apiClient.get('/resource/Employee Checkin', {
      params: {
        filters: JSON.stringify([
          ['employee', '=', employeeId],
          ['time', 'between', [`${date} 00:00:00`, `${date} 23:59:59`]],
        ]),
        fields: JSON.stringify(['name', 'log_type', 'time', 'shift', 'device_id']),
        order_by: 'time asc',
        limit: 50,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data); // fire & forget
    return data;
  } catch (error) {
    if (error.sessionExpired) throw sessionExpiredError();
    const cached = await getCache(CACHE_KEY);
    if (cached) return cached;
    console.error('Error fetching checkins:', error);
    throw error;
  }
};

// Extract the most user-readable message from a Frappe REST error response.
const parseFrappeError = (error) => {
  const data = error.response?.data;
  if (!data) return error.message;

  // _server_messages is a JSON-encoded array of message objects — most user-friendly
  if (data._server_messages) {
    try {
      const msgs = JSON.parse(data._server_messages);
      const parsed = JSON.parse(msgs[0]);
      if (parsed.message) return parsed.message;
    } catch { /* fall through */ }
  }

  // exception field is the full Python traceback — grab the last line only
  if (data.exception) {
    const lines = data.exception.trim().split('\n');
    const last = lines[lines.length - 1];
    const colon = last.indexOf(':');
    return colon >= 0 ? last.slice(colon + 1).trim() : last;
  }

  return data.message || error.message;
};

const GEO_ERROR_SNIPPET = 'Latitude and longitude values are required';
const GEO_ERROR2        = 'GPS location is required';
const SELFIE_ERROR      = 'Selfie is mandatory';

// Upload selfie as binary multipart BEFORE creating the checkin.
// This is the same binary upload path that successfully wrote selfie files in April 2026.
// Returns the Frappe file_url (e.g. "/private/files/selfie_xxx.jpg").
const uploadSelfieGetUrl = async (photoUri) => {
  const [siteUrl, authMethod] = await Promise.all([
    AsyncStorage.getItem('siteUrl'),
    AsyncStorage.getItem('authMethod'),
  ]);
  if (!siteUrl) throw new Error('No site configured.');

  const headers = {};
  if (authMethod === 'api_key') {
    const token = await AsyncStorage.getItem('authToken');
    if (token) headers['Authorization'] = `Basic ${token}`;
  } else {
    const sid = await AsyncStorage.getItem('sessionId');
    if (sid) headers['Cookie'] = `sid=${sid}`;
  }

  const filename = `selfie_${Date.now()}.jpg`;
  const formData = new FormData();
  formData.append('file', { uri: photoUri, type: 'image/jpeg', name: filename });
  // Belt-and-braces server-side cap: the capture is already ~720px (see
  // utils/camera.js), this just stops an unexpectedly large frame from being
  // stored at full size.
  formData.append('optimize', '1');
  formData.append('max_width', '1280');
  // Selfies are photos of people (employees, and via kiosk mode, students), so
  // a public file_url — readable by anyone with the link, forever — is the
  // wrong default. Upload them private wherever the site can serve them back
  // through next_attendance's signed URLs, and fall back to the old public
  // path on sites that can't, so the selfie stays viewable either way.
  const canGoPrivate = await hasPrivateSelfieSupport();
  formData.append('is_private', canGoPrivate ? '1' : '0');
  formData.append('folder', 'Home/Attachments');

  // Raw fetch has no timeout — abort after 45s so the punch spinner can't hang forever
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let resp;
  try {
    resp = await fetch(`${siteUrl}/api/method/upload_file`, {
      method: 'POST', headers, body: formData, signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Selfie upload timed out. Check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error('Selfie upload HTTP error:', resp.status, body.slice(0, 200));
    throw new Error(`Selfie upload failed (HTTP ${resp.status}). Please try again.`);
  }
  const data = await resp.json();
  const fileUrl = data.message?.file_url;
  if (!fileUrl) throw new Error('Selfie upload returned no file URL. Please try again.');
  return fileUrl;
};

// Two-step punch:
//  1. Upload selfie binary → get file_url (proven path used in April 2026)
//  2. POST to attendance_app_punch Server Script with file_url + location
//
// This is the raw network path. UI code should not call it directly — punches
// go through utils/punchQueue, which calls this in the background and retries.
//
// `time` is the moment the punch was taken, which is not necessarily now: a
// queued punch may sync much later and must still record when it happened.
//
// Errors the server actively refused are tagged `permanent` so the queue knows
// not to retry them.
export const sendCheckin = async (employeeId, logType, options = {}) => {
  try {
    const { location, photoUri, notes, time } = options;

    let selfieFileUrl = null;
    if (photoUri) {
      selfieFileUrl = await uploadSelfieGetUrl(photoUri);
    }

    const payload = {
      employee: employeeId,
      log_type: logType,
      time:     time || formatDateTime(new Date()),
    };
    if (location?.latitude != null && location?.longitude != null) {
      payload.latitude  = location.latitude;
      payload.longitude = location.longitude;
    }
    if (selfieFileUrl) {
      payload.selfie_file_url = selfieFileUrl;
    }
    if (notes) {
      payload.notes = notes;
    }

    const response = await apiClient.post('/method/attendance_app_punch', payload);
    return response.data.message;
  } catch (error) {
    // Session expiry and network failures are retryable — leave them untagged
    // so the queue tries again rather than discarding the punch.
    if (error.sessionExpired) throw sessionExpiredError();
    // uploadSelfieGetUrl errors have no .response
    if (!error.response) throw error;

    const raw = parseFrappeError(error);
    console.error('Error creating checkin:', raw);

    // The server responded and refused. Retrying will fail identically, so tag
    // these as permanent and let the user see why.
    const reject = (message) => {
      const e = new Error(message);
      e.permanent = true;
      throw e;
    };

    if (raw?.includes(GEO_ERROR_SNIPPET) || raw?.includes(GEO_ERROR2)) {
      reject('Your organization requires GPS location for every check-in.\n\nPlease enable location access in your device settings and try again.');
    }
    if (raw?.includes(SELFIE_ERROR)) {
      reject('A selfie photo is required for check-in. Please grant camera access and try again.');
    }
    // Geofence block: "Check-in blocked: Xm away from …" — already user-friendly
    reject(raw || 'Failed to record punch. Please try again.');
  }
};

// ── Attendance Records ────────────────────────────────────────────────────────

// Fetch all attendance records for a specific month (used by the calendar view).
export const getMonthAttendance = async (employeeId, year, month) => {
  const mm         = String(month).padStart(2, '0');
  const firstDay   = `${year}-${mm}-01`;
  const lastDay    = formatDate(new Date(year, month, 0)); // new Date(y, m, 0) = last day of month
  const CACHE_KEY  = `attendance_cal_${employeeId}_${year}_${mm}`;
  try {
    const response = await apiClient.get('/resource/Attendance', {
      params: {
        filters: JSON.stringify([
          ['employee',        '=',       employeeId],
          ['attendance_date', 'between', [firstDay, lastDay]],
          ['docstatus',       '!=',      2],
        ]),
        fields: JSON.stringify([
          'name', 'attendance_date', 'status',
          'in_time', 'out_time', 'working_hours',
          'late_entry', 'early_exit',
        ]),
        order_by: 'attendance_date asc',
        limit: 31,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data);
    return data;
  } catch (error) {
    if (error.sessionExpired) throw sessionExpiredError();
    const cached = await getCache(CACHE_KEY);
    if (cached) return cached;
    throw error;
  }
};

// Fetch Employee Checkin records for a month, grouped by date.
// Used alongside getMonthAttendance so the calendar shows punch activity
// even before Frappe's Auto Attendance has generated Attendance records.
// Full checkin details for a single day including selfie URL — used by the day-detail modal.
export const getDateCheckins = async (employeeId, dateStr) => {
  try {
    const response = await apiClient.get('/resource/Employee Checkin', {
      params: {
        filters: JSON.stringify([
          ['employee', '=', employeeId],
          ['time', 'between', [`${dateStr} 00:00:00`, `${dateStr} 23:59:59`]],
        ]),
        fields: JSON.stringify([
          'name', 'log_type', 'time',
          'custom_selfie_image', 'shift',
          'custom_geofence_status', 'custom_matched_location', 'custom_distance_meters',
          'latitude', 'longitude', 'custom_notes',
        ]),
        order_by: 'time asc',
        limit: 20,
      },
    });
    return response.data.data || [];
  } catch (error) {
    if (error.sessionExpired) throw sessionExpiredError();
    return [];
  }
};

// Resolve displayable selfie URLs for a set of Employee Checkins.
//
// On a site with next_attendance, selfies are private and this exchanges the
// checkin names for short-lived signed URLs — the server checks read
// permission per checkin, and the signature means <Image> needs no auth
// headers (which is the part Android breaks on).
//
// On a site without it, selfies are public and their stored file_url is used
// directly. Callers don't need to care which. Returns { checkinName: url }.
export const getSelfieUrls = async (checkins) => {
  // Accept either names or full checkin rows, so callers that already hold the
  // record don't have to re-fetch it for the fallback path.
  const rows = (checkins || [])
    .filter(Boolean)
    .map((c) => (typeof c === 'string' ? { name: c } : c));
  if (!rows.length) return {};

  const siteUrl = await AsyncStorage.getItem('siteUrl');

  if (await hasPrivateSelfieSupport()) {
    try {
      const response = await apiClient.post('/method/next_attendance.api.sign_selfies', {
        checkins: JSON.stringify(rows.map((r) => r.name)),
      });
      const signed = response.data.message || {};
      return Object.fromEntries(
        Object.entries(signed).map(([name, path]) => [name, `${siteUrl}${path}`])
      );
    } catch (error) {
      if (error.sessionExpired) throw sessionExpiredError();
      console.warn('Could not sign selfie URLs:', error.message);
      return {};
    }
  }

  // Public-file site: the stored path is already directly loadable.
  return Object.fromEntries(
    rows
      .filter((r) => r.custom_selfie_image)
      .map((r) => [r.name, `${siteUrl}${r.custom_selfie_image}`])
  );
};

export const getMonthCheckins = async (employeeId, year, month) => {
  const mm       = String(month).padStart(2, '0');
  const firstDay = `${year}-${mm}-01`;
  const lastDay  = formatDate(new Date(year, month, 0));
  const CACHE_KEY = `checkins_cal_${employeeId}_${year}_${mm}`;
  try {
    const response = await apiClient.get('/resource/Employee Checkin', {
      params: {
        filters: JSON.stringify([
          ['employee', '=', employeeId],
          ['time', 'between', [`${firstDay} 00:00:00`, `${lastDay} 23:59:59`]],
        ]),
        fields: JSON.stringify(['name', 'time', 'log_type']),
        order_by: 'time asc',
        limit: 200,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data);
    // Group by date string (YYYY-MM-DD)
    const byDate = {};
    data.forEach((c) => {
      const dateStr = c.time.slice(0, 10);
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push(c);
    });
    return byDate;
  } catch (error) {
    if (error.sessionExpired) throw sessionExpiredError();
    const cached = await getCache(CACHE_KEY);
    if (cached) return cached;
    return {};
  }
};

export const getAttendanceHistory = async (employeeId, limit = 30) => {
  const CACHE_KEY = `attendance_history_${employeeId}`;
  try {
    const response = await apiClient.get('/resource/Attendance', {
      params: {
        filters: JSON.stringify([
          ['employee', '=', employeeId],
          ['docstatus', '!=', 2],
        ]),
        fields: JSON.stringify([
          'name', 'attendance_date', 'status',
          'in_time', 'out_time', 'working_hours',
          'shift', 'late_entry', 'early_exit',
        ]),
        order_by: 'attendance_date desc',
        limit,
      },
    });
    const data = response.data.data || [];
    setCache(CACHE_KEY, data);
    return data;
  } catch (error) {
    if (error.sessionExpired) throw sessionExpiredError();
    const cached = await getCache(CACHE_KEY);
    if (cached) return cached;
    console.error('Error fetching attendance history:', error);
    throw error;
  }
};

export const getMonthSummary = async (employeeId) => {
  const now      = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const CACHE_KEY = `month_summary_${employeeId}_${yearMonth}`;
  try {
    const firstDay = `${yearMonth}-01`;
    const today    = formatDate(now);
    const response = await apiClient.get('/resource/Attendance', {
      params: {
        filters: JSON.stringify([
          ['employee',        '=',       employeeId],
          ['attendance_date', 'between', [firstDay, today]],
          ['docstatus',       '!=',      2],
        ]),
        fields: JSON.stringify(['status', 'attendance_date', 'working_hours']),
        limit: 100,
      },
    });
    const records = response.data.data || [];
    const summary = { present: 0, absent: 0, halfDay: 0, onLeave: 0, totalHours: 0 };
    records.forEach((r) => {
      if      (r.status === 'Present')  summary.present++;
      else if (r.status === 'Absent')   summary.absent++;
      else if (r.status === 'Half Day') summary.halfDay++;
      else if (r.status === 'On Leave') summary.onLeave++;
      summary.totalHours += parseFloat(r.working_hours || 0);
    });
    setCache(CACHE_KEY, summary);
    return summary;
  } catch (error) {
    const cached = await getCache(CACHE_KEY);
    if (cached) return cached;
    console.error('Error fetching month summary:', error);
    return { present: 0, absent: 0, halfDay: 0, onLeave: 0, totalHours: 0 };
  }
};
