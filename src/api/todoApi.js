import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { getSiteUrl } from '../utils/siteConfig';

// Tasks are Frappe's built-in ToDo. Frappe already limits a normal user to
// to-dos assigned to them or by them, and lets them edit those, so this needs
// nothing from next_attendance and works on any Frappe site.

const FALLBACK_STATUSES   = ['Open', 'Closed', 'Cancelled'];
const FALLBACK_PRIORITIES = ['High', 'Medium', 'Low'];

// Statuses that mean "finished". Any other status the site defines (e.g. an
// "In Progress" added through Customize Form) counts as still active.
export const DONE_STATUSES = ['Closed', 'Cancelled'];
export const isDone = (status) => DONE_STATUSES.includes(status);

const setCache = (key, data) => AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
const getCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const optionsOf = (meta, fieldname) =>
  ((meta?.fields || []).find((f) => f.fieldname === fieldname)?.options || '')
    .split('\n').map((o) => o.trim()).filter(Boolean);

// The status and priority choices, read from the site's own ToDo definition
// (Customize Form changes included), so a status added on the site shows up in
// the app without an app update.
export const getTodoOptions = async () => {
  const KEY = 'todo_options';
  try {
    const r = await apiClient.get('/method/frappe.desk.form.load.getdoctype', { params: { doctype: 'ToDo' } });
    const meta = (r.data.docs || []).find((d) => d.name === 'ToDo');
    const statuses   = optionsOf(meta, 'status');
    const priorities = optionsOf(meta, 'priority');
    const out = {
      statuses:   statuses.length ? statuses : FALLBACK_STATUSES,
      priorities: priorities.length ? priorities : FALLBACK_PRIORITIES,
    };
    setCache(KEY, out);
    return out;
  } catch (e) {
    if (e.sessionExpired) throw e;
    return (await getCache(KEY)) || { statuses: FALLBACK_STATUSES, priorities: FALLBACK_PRIORITIES };
  }
};

// The Frappe user id. Not necessarily what was typed at login: Frappe also
// accepts a username or mobile number there.
const getSessionUser = async () => {
  try {
    const r = await apiClient.get('/method/frappe.auth.get_logged_user');
    if (r.data.message) {
      AsyncStorage.setItem('sessionUser', r.data.message).catch(() => {});
      return r.data.message;
    }
  } catch (e) {
    if (e.sessionExpired) throw e;
  }
  return (await AsyncStorage.getItem('sessionUser')) || AsyncStorage.getItem('userEmail');
};

const LIST_FIELDS = [
  'name', 'status', 'priority', 'date', 'description',
  'reference_type', 'reference_name', 'assigned_by', 'assigned_by_full_name',
  'allocated_to', 'modified',
];

// The user's tasks: every active one, plus the most recent finished ones.
// Filtered on allocated_to explicitly, because an HR or System Manager can see
// everyone's to-dos and would otherwise get the whole company's list.
// Shows the cached list when offline.
export const getMyTodos = async () => {
  const user = await getSessionUser();
  const KEY = `todos_${user}`;
  const query = (statusOp, limit, order) => apiClient.get('/resource/ToDo', {
    params: {
      filters: JSON.stringify([['allocated_to', '=', user], ['status', statusOp, DONE_STATUSES]]),
      fields: JSON.stringify(LIST_FIELDS),
      order_by: order,
      limit_page_length: limit,
    },
  }).then((r) => r.data.data || []);
  try {
    const [active, done] = await Promise.all([
      query('not in', 200, 'date asc, modified desc'),
      query('in', 100, 'modified desc'),
    ]);
    const out = { user, active, done, offline: false };
    setCache(KEY, out);
    return out;
  } catch (e) {
    if (e.sessionExpired) throw e;
    const cached = await getCache(KEY);
    if (cached) return { ...cached, offline: true };
    throw e;
  }
};

// One task with its comments, newest first.
export const getTodoDetail = async (name) => {
  const r = await apiClient.get('/method/frappe.desk.form.load.getdoc', { params: { doctype: 'ToDo', name } });
  const doc = (r.data.docs || [])[0];
  const comments = (r.data.docinfo?.comments || [])
    .slice()
    .sort((a, b) => (a.creation < b.creation ? 1 : -1));
  return { doc, comments };
};

export const setTodoStatus = (name, status) =>
  apiClient.put(`/resource/ToDo/${encodeURIComponent(name)}`, { status }).then((r) => r.data.data);

const escapeHtml = (t) => t
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Plain text in, HTML out: what the desk's comment box would have stored.
const toHtml = (text) => text.trim().split(/\n{2,}/)
  .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('');

// Shows in the desk under the to-do's comments, like a comment typed there.
export const addTodoComment = async (name, text) => {
  const user = await getSessionUser();
  const fullName = (await AsyncStorage.getItem('userName')) || user;
  const r = await apiClient.post('/method/frappe.desk.form.utils.add_comment', {
    reference_doctype: 'ToDo',
    reference_name: name,
    content: toHtml(text),
    comment_email: user,
    comment_by: fullName,
  });
  return r.data.message;
};

// A personal task: assigned by and to the user.
export const createTodo = async ({ description, date, priority }) => {
  const user = await getSessionUser();
  const r = await apiClient.post('/resource/ToDo', {
    description: toHtml(description),
    date: date || null,
    priority,
    allocated_to: user,
    assigned_by: user,
  });
  return r.data.data;
};

// The desk page for a task's linked document (e.g. /app/sales-invoice/SINV-0001),
// to open in the browser. Same rule the desk uses for its URLs.
//
// Both parts come from the server and are encoded, so a name containing "/",
// "?", "#" or a scheme stays inside the path and can't point anywhere else.
// The result is only ever handed to the browser: no token or cookie goes with
// it, and the browser's own login and Frappe's permissions apply there.
export const getReferenceUrl = async (doctype, name) => {
  const site = await getSiteUrl();
  if (!site || !doctype || !name) return null;
  if (name === '.' || name === '..' || !/^https?:\/\//.test(site)) return null;
  const slug = doctype.toLowerCase().replace(/ /g, '-');
  const url = `${site}/app/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`;
  // Belt and braces: only ever open a desk page on the user's own site.
  return url.startsWith(`${site}/app/`) ? url : null;
};

// ToDo descriptions and comments are HTML from the desk's editor. The app
// shows them as plain text.
export const htmlToText = (html) => (html || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
  .replace(/<li[^>]*>/gi, '• ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
