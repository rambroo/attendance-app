import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, themed } from '../utils/theme';
import {
  getMyTodos, getTodoOptions, getTodoDetail, setTodoStatus,
  addTodoComment, createTodo, isDone, htmlToText,
} from '../api/todoApi';
import { formatDate } from '../api/attendanceApi';
import DatePickerModal from '../components/DatePickerModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Colours for the statuses Frappe ships with. A status the site adds itself
// (e.g. "In Progress") gets the amber "in between" colour.
const statusColors = (status) => {
  if (status === 'Open')      return { bg: C.infoLight, fg: C.infoText };
  if (status === 'Closed')    return { bg: C.inLight,   fg: C.inText };
  if (status === 'Cancelled') return { bg: C.divider,   fg: C.neutral };
  return { bg: C.warnLight, fg: C.warnText };
};

const priorityColor = (p) => (p === 'High' ? C.error : p === 'Low' ? C.neutral : C.warn);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDue = (date) => {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const today = formatDate(new Date());
  const tomorrow = formatDate(new Date(Date.now() + 86400000));
  if (date === today) return 'Today';
  if (date === tomorrow) return 'Tomorrow';
  const thisYear = new Date().getFullYear();
  return `${d} ${MONTHS[m - 1]}${y !== thisYear ? ` ${y}` : ''}`;
};
const isOverdue = (todo) => !!todo.date && !isDone(todo.status) && todo.date < formatDate(new Date());

const timeAgo = (ts) => {
  if (!ts) return '';
  const then = new Date(ts.replace(' ', 'T'));
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} d ago`;
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
};

const errorText = (e, fallback) => {
  if (!e?.response) return 'No connection. Check your internet and try again.';
  try {
    const msgs = JSON.parse(e.response.data?._server_messages || '[]');
    if (msgs.length) return JSON.parse(msgs[0]).message.replace(/<[^>]+>/g, '');
  } catch { /* fall through */ }
  return fallback;
};

const StatusPill = memo(({ status }) => {
  const c = statusColors(status);
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.fg }]}>{status}</Text>
    </View>
  );
});

// ── Task card ─────────────────────────────────────────────────────────────────

const TaskCard = memo(({ todo, user, onPress }) => {
  const text = htmlToText(todo.description) || '(no description)';
  const overdue = isOverdue(todo);
  const fromOther = todo.assigned_by && todo.assigned_by !== user;
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(todo)} activeOpacity={0.8}>
      <View style={s.cardTop}>
        <StatusPill status={todo.status} />
        {todo.date ? (
          <Text style={[s.due, overdue && s.dueLate]}>
            {overdue ? 'Overdue · ' : 'Due '}{formatDue(todo.date)}
          </Text>
        ) : null}
      </View>
      <Text style={[s.cardText, isDone(todo.status) && s.cardTextDone]} numberOfLines={3}>{text}</Text>
      <View style={s.cardMeta}>
        {todo.priority ? (
          <View style={s.metaItem}>
            <View style={[s.dot, { backgroundColor: priorityColor(todo.priority) }]} />
            <Text style={s.metaText}>{todo.priority}</Text>
          </View>
        ) : null}
        {fromOther ? (
          <Text style={s.metaText} numberOfLines={1}>From {todo.assigned_by_full_name || todo.assigned_by}</Text>
        ) : null}
        {todo.reference_type ? (
          <Text style={s.metaText} numberOfLines={1}>{todo.reference_type} · {todo.reference_name}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

// ── Task detail ───────────────────────────────────────────────────────────────

const TaskDetail = ({ todo, user, statuses, onClose, onChanged, onSessionExpired }) => {
  const [detail, setDetail]       = useState(null);
  const [status, setStatus]       = useState(todo?.status);
  const [saving, setSaving]       = useState('');
  const [comment, setComment]     = useState('');
  const [posting, setPosting]     = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    if (!todo) return;
    try {
      const d = await getTodoDetail(todo.name);
      setDetail(d);
      if (d.doc?.status) setStatus(d.doc.status);
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
      setError(errorText(e, 'Could not load this task.'));
    }
  }, [todo, onSessionExpired]);

  useEffect(() => {
    setDetail(null); setError(''); setComment(''); setStatus(todo?.status);
    load();
  }, [todo, load]);

  const changeStatus = async (next) => {
    if (next === status || saving) return;
    setSaving(next); setError('');
    try {
      await setTodoStatus(todo.name, next);
      setStatus(next);
      onChanged();
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
      setError(errorText(e, 'Could not change the status.'));
    } finally {
      setSaving('');
    }
  };

  const postComment = async () => {
    if (!comment.trim() || posting) return;
    setPosting(true); setError('');
    try {
      await addTodoComment(todo.name, comment);
      setComment('');
      await load();
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
      setError(errorText(e, 'Could not post your update.'));
    } finally {
      setPosting(false);
    }
  };

  if (!todo) return null;
  const doc = detail?.doc || todo;
  const fromOther = doc.assigned_by && doc.assigned_by !== user;
  // Show the site's statuses, plus the current one if the site no longer lists it.
  const choices = statuses.includes(status) ? statuses : [...statuses, status];

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { flex: 1 }]}>Task</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.detailBody} keyboardShouldPersistTaps="handled">
          <Text style={s.detailText}>{htmlToText(doc.description) || '(no description)'}</Text>

          <View style={s.infoCard}>
            {doc.date ? <InfoRow label="Due" value={formatDue(doc.date)} danger={isOverdue({ ...doc, status })} /> : null}
            {doc.priority ? <InfoRow label="Priority" value={doc.priority} /> : null}
            <InfoRow label="Assigned by" value={fromOther ? (doc.assigned_by_full_name || doc.assigned_by) : 'You'} />
            {doc.reference_type ? <InfoRow label="Linked to" value={`${doc.reference_type} · ${doc.reference_name}`} /> : null}
          </View>

          <Text style={s.sectionLabel}>Status</Text>
          <View style={s.chipRow}>
            {choices.map((opt) => {
              const on = opt === status;
              const c = statusColors(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[s.chip, on && { backgroundColor: c.bg, borderColor: c.fg }]}
                  onPress={() => changeStatus(opt)}
                  disabled={!!saving}
                  activeOpacity={0.75}
                >
                  {saving === opt
                    ? <ActivityIndicator size="small" color={c.fg} />
                    : <Text style={[s.chipText, on && { color: c.fg, fontWeight: '700' }]}>{on ? '✓ ' : ''}{opt}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          <Text style={s.sectionLabel}>Updates</Text>
          <View style={s.commentBox}>
            <TextInput
              style={s.commentInput}
              placeholder="Add an update for your manager…"
              placeholderTextColor={C.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, (!comment.trim() || posting) && s.sendBtnOff]}
              onPress={postComment}
              disabled={!comment.trim() || posting}
              activeOpacity={0.8}
            >
              {posting ? <ActivityIndicator size="small" color={C.onBrand} /> : <Text style={s.sendText}>Post</Text>}
            </TouchableOpacity>
          </View>

          {!detail && !error ? <ActivityIndicator color={C.brand} style={{ marginTop: 16 }} /> : null}
          {detail && detail.comments.length === 0 ? <Text style={s.noComments}>No updates yet.</Text> : null}
          {(detail?.comments || []).map((c) => (
            <View key={c.name} style={s.comment}>
              <View style={s.commentHead}>
                <Text style={s.commentBy}>{c.comment_email === user ? 'You' : (c.comment_by || c.owner)}</Text>
                <Text style={s.commentTime}>{timeAgo(c.creation)}</Text>
              </View>
              <Text style={s.commentText}>{htmlToText(c.content)}</Text>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const InfoRow = ({ label, value, danger }) => (
  <View style={s.infoRow}>
    <Text style={s.infoLabel}>{label}</Text>
    <Text style={[s.infoValue, danger && { color: C.error }]} numberOfLines={2}>{value}</Text>
  </View>
);

// ── New task ──────────────────────────────────────────────────────────────────

const NewTask = ({ priorities, onClose, onCreated, onSessionExpired }) => {
  const [text, setText]         = useState('');
  const [date, setDate]         = useState('');
  const [priority, setPriority] = useState(priorities.includes('Medium') ? 'Medium' : priorities[0]);
  const [picker, setPicker]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const save = async () => {
    if (!text.trim()) { setError('Write what needs to be done.'); return; }
    setSaving(true); setError('');
    try {
      await createTodo({ description: text, date, priority });
      onCreated();
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
      setError(errorText(e, 'Could not save the task.'));
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { flex: 1 }]}>New task</Text>
      </View>
      <ScrollView contentContainerStyle={s.detailBody} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionLabel}>What needs to be done?</Text>
        <TextInput
          style={s.bigInput}
          placeholder="e.g. Submit the monthly report"
          placeholderTextColor={C.textMuted}
          value={text}
          onChangeText={(t) => { setText(t); setError(''); }}
          multiline
          autoFocus
        />

        <Text style={s.sectionLabel}>Due date (optional)</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={[s.chip, { flex: 1 }]} onPress={() => setPicker(true)} activeOpacity={0.75}>
            <Text style={date ? s.chipText : s.placeholder}>{date ? formatDue(date) : 'Pick a date'}</Text>
          </TouchableOpacity>
          {date ? (
            <TouchableOpacity onPress={() => setDate('')} style={{ padding: 10 }}>
              <Text style={s.clearText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={s.sectionLabel}>Priority</Text>
        <View style={s.chipRow}>
          {priorities.map((p) => {
            const on = p === priority;
            return (
              <TouchableOpacity
                key={p}
                style={[s.chip, on && { borderColor: priorityColor(p), backgroundColor: C.cardAlt }]}
                onPress={() => setPriority(p)}
                activeOpacity={0.75}
              >
                <View style={s.metaItem}>
                  <View style={[s.dot, { backgroundColor: priorityColor(p) }]} />
                  <Text style={[s.chipText, on && { fontWeight: '700' }]}>{p}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <TouchableOpacity style={[s.saveBtn, saving && s.sendBtnOff]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color={C.onBrand} /> : <Text style={s.saveText}>Add task</Text>}
        </TouchableOpacity>
      </ScrollView>

      <DatePickerModal
        visible={picker}
        title="Due date"
        selectedDate={date}
        onSelect={setDate}
        onClose={() => setPicker(false)}
      />
    </SafeAreaView>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TasksScreen({ onSessionExpired }) {
  const [data, setData]           = useState(null);
  const [options, setOptions]     = useState({ statuses: ['Open', 'Closed', 'Cancelled'], priorities: ['High', 'Medium', 'Low'] });
  const [view, setView]           = useState('active');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');
  const [openTask, setOpenTask]   = useState(null);
  const [creating, setCreating]   = useState(false);

  const load = useCallback(async () => {
    try {
      const [todos, opts] = await Promise.all([getMyTodos(), getTodoOptions()]);
      setData(todos); setOptions(opts); setError('');
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
      setError(errorText(e, 'Could not load your tasks.'));
    }
  }, [onSessionExpired]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleOpen = useCallback((todo) => setOpenTask(todo), []);
  const handleCreated = useCallback(() => { setCreating(false); setView('active'); load(); }, [load]);

  const list = data ? (view === 'active' ? data.active : data.done) : [];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={[s.headerTitle, { flex: 1 }]}>My Tasks</Text>
        {data?.offline ? <View style={s.offlinePill}><Text style={s.offlineText}>⚡ Offline</Text></View> : null}
        <TouchableOpacity style={s.newBtn} onPress={() => setCreating(true)} activeOpacity={0.8}>
          <Text style={s.newText}>＋ New</Text>
        </TouchableOpacity>
      </View>

      <View style={s.segment}>
        {[['active', 'To do', data?.active.length], ['done', 'Done', data?.done.length]].map(([key, label, n]) => (
          <TouchableOpacity
            key={key}
            style={[s.segBtn, view === key && s.segBtnOn]}
            onPress={() => setView(key)}
            activeOpacity={0.8}
          >
            <Text style={[s.segText, view === key && s.segTextOn]}>
              {label}{n !== undefined ? `  ${n}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!data && !error ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.name}
          renderItem={({ item }) => <TaskCard todo={item} user={data?.user} onPress={handleOpen} />}
          contentContainerStyle={s.listBody}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.brand} />}
          ListHeaderComponent={error ? <Text style={[s.errorText, { marginBottom: 12 }]}>{error}</Text> : null}
          ListEmptyComponent={data ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>{view === 'active' ? '🎉' : '📭'}</Text>
              <Text style={s.emptyTitle}>{view === 'active' ? 'Nothing to do' : 'No finished tasks yet'}</Text>
              <Text style={s.emptySub}>
                {view === 'active'
                  ? 'Tasks assigned to you will show up here. Tap ＋ New to add your own.'
                  : 'Tasks you mark as done will show up here.'}
              </Text>
            </View>
          ) : null}
        />
      )}

      <Modal visible={!!openTask} animationType="slide" onRequestClose={() => setOpenTask(null)}>
        <TaskDetail
          todo={openTask}
          user={data?.user}
          statuses={options.statuses}
          onClose={() => setOpenTask(null)}
          onChanged={load}
          onSessionExpired={onSessionExpired}
        />
      </Modal>

      <Modal visible={creating} animationType="slide" onRequestClose={() => setCreating(false)}>
        <NewTask
          priorities={options.priorities}
          onClose={() => setCreating(false)}
          onCreated={handleCreated}
          onSessionExpired={onSessionExpired}
        />
      </Modal>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.heroText },
  backBtn:     { marginRight: 10, paddingRight: 4 },
  backText:    { color: C.heroText, fontSize: 30, lineHeight: 30, fontWeight: '300' },
  newBtn:      { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.heroChip, borderRadius: 8 },
  newText:     { color: C.heroText, fontSize: 13, fontWeight: '700' },
  offlinePill: { backgroundColor: C.heroWarnChip, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  offlineText: { color: C.heroWarnText, fontSize: 11, fontWeight: '600' },

  segment:     { flexDirection: 'row', margin: 16, marginBottom: 4, backgroundColor: C.card, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: C.border },
  segBtn:      { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segBtnOn:    { backgroundColor: C.brand },
  segText:     { fontSize: 14, fontWeight: '600', color: C.textSecond },
  segTextOn:   { color: C.onBrand },

  listBody:    { padding: 16, paddingTop: 12, flexGrow: 1 },
  card:        { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardText:    { fontSize: 15, color: C.textPrimary, lineHeight: 21 },
  cardTextDone:{ color: C.textMuted, textDecorationLine: 'line-through' },
  cardMeta:    { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
  metaItem:    { flexDirection: 'row', alignItems: 'center' },
  metaText:    { fontSize: 12, color: C.textMuted, marginRight: 12 },
  dot:         { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  due:         { fontSize: 12, color: C.textSecond, fontWeight: '600' },
  dueLate:     { color: C.error },
  pill:        { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  pillText:    { fontSize: 11, fontWeight: '700' },

  empty:       { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyIcon:   { fontSize: 40, marginBottom: 10 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 6 },
  emptySub:    { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },

  detailBody:  { padding: 16, paddingBottom: 40 },
  detailText:  { fontSize: 16, color: C.textPrimary, lineHeight: 23, marginBottom: 16 },
  infoCard:    { backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border },
  infoRow:     { flexDirection: 'row', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.divider },
  infoLabel:   { width: 100, fontSize: 13, color: C.textMuted },
  infoValue:   { flex: 1, fontSize: 13, color: C.textPrimary, fontWeight: '600' },
  sectionLabel:{ fontSize: 12, fontWeight: '700', color: C.textSecond, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap' },
  chip:        { borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, marginBottom: 8, minWidth: 70, alignItems: 'center' },
  chipText:    { fontSize: 14, color: C.textPrimary },
  placeholder: { fontSize: 14, color: C.textMuted },
  clearText:   { color: C.textSecond, fontSize: 13 },
  errorText:   { color: C.errorText, backgroundColor: C.errorLight, borderRadius: 8, padding: 10, fontSize: 13, marginTop: 8 },

  commentBox:  { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 8 },
  commentInput:{ flex: 1, fontSize: 14, color: C.textPrimary, maxHeight: 120, paddingHorizontal: 6, paddingVertical: 6 },
  sendBtn:     { backgroundColor: C.brand, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, marginLeft: 6 },
  sendBtnOff:  { opacity: 0.45 },
  sendText:    { color: C.onBrand, fontWeight: '700', fontSize: 13 },
  noComments:  { color: C.textMuted, fontSize: 13, marginTop: 12 },
  comment:     { backgroundColor: C.card, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border },
  commentHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  commentBy:   { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  commentTime: { fontSize: 11, color: C.textMuted },
  commentText: { fontSize: 14, color: C.textSecond, lineHeight: 20 },

  bigInput:    { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, fontSize: 15, color: C.textPrimary, minHeight: 110, textAlignVertical: 'top' },
  saveBtn:     { backgroundColor: C.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 28 },
  saveText:    { color: C.onBrand, fontSize: 16, fontWeight: '700' },
}));
