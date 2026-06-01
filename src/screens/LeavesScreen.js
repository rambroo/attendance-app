import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, Modal, TextInput, Switch,
  ActivityIndicator, Alert, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../utils/theme';
import {
  getLeaveTypes, getLeaveBalances, getLeaveApplications,
  applyLeave, getHolidaysForEmployee,
} from '../api/leaveApi';

const SCREEN_W = Dimensions.get('window').width;
const TABS = ['Balance', 'Apply', 'History', 'Holidays'];

// ── Date Picker Modal ─────────────────────────────────────────────────────────

const DatePickerModal = memo(({ visible, title, selectedDate, onSelect, onClose }) => {
  const today = new Date();
  const initDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  useEffect(() => {
    if (visible) {
      const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible]);

  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow     = new Date(viewYear, viewMonth, 1).getDay();
  const monthLabel   = new Date(viewYear, viewMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const isSelected = (day) => {
    if (!day || !selectedDate) return false;
    const sel = new Date(selectedDate + 'T00:00:00');
    return sel.getFullYear() === viewYear && sel.getMonth() === viewMonth && sel.getDate() === day;
  };

  const handleDay = (day) => {
    if (!day) return;
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onSelect(`${viewYear}-${mm}-${dd}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dp.overlay}>
        <View style={dp.box}>
          <Text style={dp.title}>{title}</Text>
          <View style={dp.navRow}>
            <TouchableOpacity onPress={prevMonth} style={dp.navBtn}>
              <Text style={dp.arrow}>‹</Text>
            </TouchableOpacity>
            <Text style={dp.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={nextMonth} style={dp.navBtn}>
              <Text style={dp.arrow}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={dp.weekRow}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <Text key={i} style={dp.weekDay}>{d}</Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={dp.row}>
              {row.map((day, ci) => (
                <TouchableOpacity
                  key={ci}
                  style={[dp.cell, isSelected(day) && dp.cellSel]}
                  onPress={() => handleDay(day)}
                  disabled={!day}
                  activeOpacity={0.7}
                >
                  {day ? (
                    <Text style={[dp.cellText, isSelected(day) && dp.cellTextSel]}>{day}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <TouchableOpacity style={dp.cancelBtn} onPress={onClose}>
            <Text style={dp.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const dp = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  box:         { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: SCREEN_W - 48 },
  title:       { fontSize: 16, fontWeight: '700', color: C.textPrimary, textAlign: 'center', marginBottom: 12 },
  navRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  navBtn:      { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  arrow:       { fontSize: 24, color: C.brand, fontWeight: '700' },
  monthLabel:  { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', color: C.textPrimary },
  weekRow:     { flexDirection: 'row', marginBottom: 4 },
  weekDay:     { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: C.textMuted },
  row:         { flexDirection: 'row' },
  cell:        { flex: 1, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, margin: 1 },
  cellSel:     { backgroundColor: C.brand },
  cellText:    { fontSize: 14, color: C.textPrimary },
  cellTextSel: { color: '#fff', fontWeight: '700' },
  cancelBtn:   { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  cancelText:  { color: C.textSecond, fontSize: 14 },
});

// ── Leave Type Picker ─────────────────────────────────────────────────────────

const LeaveTypePicker = memo(({ visible, leaveTypes, onSelect, onClose }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={ltp.overlay}>
      <View style={ltp.sheet}>
        <Text style={ltp.title}>Select Leave Type</Text>
        <ScrollView>
          {leaveTypes.map((lt) => (
            <TouchableOpacity key={lt.name} style={ltp.row} onPress={() => { onSelect(lt.name); onClose(); }}>
              <Text style={ltp.name}>{lt.name}</Text>
              {lt.max_days_allowed ? (
                <Text style={ltp.max}>Max {lt.max_days_allowed}d</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={ltp.cancel} onPress={onClose}>
          <Text style={ltp.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
));

const ltp = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', padding: 20 },
  title:      { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  row:        { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:       { fontSize: 15, color: C.textPrimary },
  max:        { fontSize: 12, color: C.textMuted },
  cancel:     { marginTop: 14, alignItems: 'center', paddingVertical: 12, backgroundColor: C.bg, borderRadius: 10 },
  cancelText: { color: C.textSecond, fontSize: 14, fontWeight: '600' },
});

// ── Balance Tab ───────────────────────────────────────────────────────────────

const BalanceTab = memo(({ employeeId, onSessionExpired }) => {
  const [balances, setBalances] = useState({});
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLeaveBalances(employeeId);
      setBalances(data);
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />;

  const entries = Object.entries(balances);
  if (!entries.length) return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>🌿</Text>
      <Text style={s.emptyText}>No leave allocations found for this period.</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.balanceGrid} showsVerticalScrollIndicator={false}>
      {entries.map(([type, info]) => {
        const total   = info.total_leaves_allocated ?? info.total ?? 0;
        const taken   = info.leaves_taken ?? info.used ?? 0;
        const pending = info.leaves_pending_approval ?? 0;
        const remain  = info.remaining ?? (total - taken);
        const pct     = total > 0 ? Math.min((taken / total) * 100, 100) : 0;
        return (
          <View key={type} style={s.balCard}>
            <Text style={s.balType}>{type}</Text>
            <View style={s.balRow}>
              <Text style={s.balRemain}>{remain}</Text>
              <Text style={s.balTotal}> / {total} days</Text>
            </View>
            <View style={s.barBg}>
              <View style={[s.barFill, { width: `${pct}%` }]} />
            </View>
            <View style={s.balMeta}>
              <Text style={s.balMetaText}>Used: {taken}d</Text>
              {pending > 0 && <Text style={s.balPending}>Pending: {pending}d</Text>}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
});

// ── Apply Tab ─────────────────────────────────────────────────────────────────

const ApplyTab = memo(({ employeeId, onSessionExpired, onApplied }) => {
  const [leaveTypes,      setLeaveTypes]      = useState([]);
  const [selectedType,    setSelectedType]    = useState('');
  const [fromDate,        setFromDate]        = useState('');
  const [toDate,          setToDate]          = useState('');
  const [halfDay,         setHalfDay]         = useState(false);
  const [reason,          setReason]          = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [showTypePicker,  setShowTypePicker]  = useState(false);
  const [showFromPicker,  setShowFromPicker]  = useState(false);
  const [showToPicker,    setShowToPicker]    = useState(false);

  useEffect(() => {
    getLeaveTypes().then(setLeaveTypes);
  }, []);

  const formatDisp = (dateStr) => {
    if (!dateStr) return 'Select date';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleSubmit = async () => {
    if (!selectedType) return Alert.alert('Missing', 'Please select a leave type.');
    if (!fromDate)     return Alert.alert('Missing', 'Please select a start date.');
    if (!toDate)       return Alert.alert('Missing', 'Please select an end date.');
    if (toDate < fromDate) return Alert.alert('Invalid', 'End date cannot be before start date.');

    setSubmitting(true);
    try {
      await applyLeave(employeeId, { leaveType: selectedType, fromDate, toDate, halfDay, reason });
      Alert.alert('Success', 'Leave application submitted successfully.');
      setSelectedType(''); setFromDate(''); setToDate(''); setHalfDay(false); setReason('');
      onApplied?.();
    } catch (e) {
      if (e.sessionExpired) { onSessionExpired?.(); return; }
      const msg = e.response?.data?._server_messages
        ? (() => { try { return JSON.parse(JSON.parse(e.response.data._server_messages)[0]).message; } catch { return e.message; } })()
        : e.message;
      Alert.alert('Error', msg || 'Could not submit leave application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={s.applyScroll} contentContainerStyle={s.applyContent} keyboardShouldPersistTaps="handled">
      {/* Leave Type */}
      <Text style={s.fieldLabel}>Leave Type *</Text>
      <TouchableOpacity style={s.selectBtn} onPress={() => setShowTypePicker(true)}>
        <Text style={selectedType ? s.selectVal : s.selectPlaceholder}>
          {selectedType || 'Select leave type'}
        </Text>
        <Text style={s.selectArrow}>›</Text>
      </TouchableOpacity>

      {/* Dates */}
      <View style={s.dateRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={s.fieldLabel}>From Date *</Text>
          <TouchableOpacity style={s.selectBtn} onPress={() => setShowFromPicker(true)}>
            <Text style={fromDate ? s.selectVal : s.selectPlaceholder}>{formatDisp(fromDate)}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{halfDay ? 'Date' : 'To Date *'}</Text>
          <TouchableOpacity style={s.selectBtn} disabled={halfDay} onPress={() => setShowToPicker(true)}>
            <Text style={(halfDay ? fromDate : toDate) ? s.selectVal : s.selectPlaceholder}>
              {halfDay ? formatDisp(fromDate) : formatDisp(toDate)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Half Day */}
      <View style={s.switchRow}>
        <Text style={s.switchLabel}>Half Day</Text>
        <Switch
          value={halfDay}
          onValueChange={(v) => { setHalfDay(v); if (v) setToDate(fromDate); }}
          trackColor={{ false: C.border, true: C.brand }}
          thumbColor="#fff"
        />
      </View>

      {/* Reason */}
      <Text style={s.fieldLabel}>Reason</Text>
      <TextInput
        style={s.textArea}
        placeholder="Enter reason (optional)"
        placeholderTextColor={C.textMuted}
        multiline
        numberOfLines={3}
        value={reason}
        onChangeText={setReason}
        textAlignVertical="top"
      />

      <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.submitText}>Submit Application</Text>
        }
      </TouchableOpacity>

      <LeaveTypePicker
        visible={showTypePicker}
        leaveTypes={leaveTypes}
        onSelect={setSelectedType}
        onClose={() => setShowTypePicker(false)}
      />
      <DatePickerModal
        visible={showFromPicker}
        title="Select From Date"
        selectedDate={fromDate}
        onSelect={(d) => { setFromDate(d); if (!toDate || toDate < d) setToDate(d); }}
        onClose={() => setShowFromPicker(false)}
      />
      <DatePickerModal
        visible={showToPicker}
        title="Select To Date"
        selectedDate={toDate || fromDate}
        onSelect={setToDate}
        onClose={() => setShowToPicker(false)}
      />
    </ScrollView>
  );
});

// ── History Tab ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  Open:     { bg: C.warnLight,  text: C.warn },
  Approved: { bg: C.brandLight, text: C.brand },
  Rejected: { bg: C.errorLight, text: C.error },
};

const LeaveRow = memo(({ item }) => {
  const sc = STATUS_COLOR[item.status] || STATUS_COLOR.Open;
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  return (
    <View style={s.leaveRow}>
      <View style={s.leaveMain}>
        <Text style={s.leaveType}>{item.leave_type}</Text>
        <Text style={s.leaveDates}>{fmt(item.from_date)} → {fmt(item.to_date)}</Text>
        {item.description ? <Text style={s.leaveReason} numberOfLines={1}>{item.description}</Text> : null}
      </View>
      <View style={s.leaveRight}>
        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[s.statusText, { color: sc.text }]}>{item.status}</Text>
        </View>
        <Text style={s.leaveDays}>{item.total_leave_days || '—'}d</Text>
      </View>
    </View>
  );
});

const HistoryTab = memo(({ employeeId, onSessionExpired, refreshTick }) => {
  const [apps,      setApps]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getLeaveApplications(employeeId);
      setApps(data);
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load, refreshTick]);

  if (loading) return <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />;
  if (!apps.length) return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>📋</Text>
      <Text style={s.emptyText}>No leave applications found.</Text>
    </View>
  );

  return (
    <FlatList
      data={apps}
      keyExtractor={(item) => item.name}
      renderItem={({ item }) => <LeaveRow item={item} />}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.brand]} />}
    />
  );
});

// ── Holidays Tab ──────────────────────────────────────────────────────────────

const HolidayRow = memo(({ item }) => {
  const d = new Date(item.holiday_date + 'T00:00:00');
  const dayName  = d.toLocaleDateString('en-IN', { weekday: 'long' });
  const dateDisp = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return (
    <View style={s.holidayRow}>
      <View style={s.holidayDateBox}>
        <Text style={s.holidayDay}>{dateDisp.split(' ')[0]}</Text>
        <Text style={s.holidayMon}>{dateDisp.split(' ')[1]}</Text>
      </View>
      <View style={s.holidayInfo}>
        <Text style={s.holidayName}>{item.description}</Text>
        <Text style={s.holidayDow}>{dayName}</Text>
      </View>
      {item.weekly_off ? (
        <View style={s.weeklyBadge}><Text style={s.weeklyText}>Weekly Off</Text></View>
      ) : null}
    </View>
  );
});

const HolidaysTab = memo(({ employeeId, onSessionExpired }) => {
  const [holidays, setHolidays] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const year = new Date().getFullYear();

  useEffect(() => {
    setLoading(true);
    getHolidaysForEmployee(employeeId, year)
      .then((data) => {
        // Normalize: HRMS method may return {holiday_date, description} or {date, name}
        const normalized = data.map((h) => ({
          holiday_date: h.holiday_date || h.date,
          description:  h.description  || h.holiday_name || h.name,
          weekly_off:   h.weekly_off   || false,
        }));
        setHolidays(normalized);
      })
      .catch((e) => { if (e.sessionExpired) onSessionExpired?.(); })
      .finally(() => setLoading(false));
  }, [employeeId, year]);

  if (loading) return <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />;
  if (!holidays.length) return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>🗓</Text>
      <Text style={s.emptyText}>No holidays found for {year}.</Text>
    </View>
  );

  return (
    <FlatList
      data={holidays}
      keyExtractor={(item, i) => item.holiday_date || String(i)}
      renderItem={({ item }) => <HolidayRow item={item} />}
      contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={
        <Text style={s.yearHeader}>Holidays — {year}</Text>
      }
    />
  );
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function LeavesScreen({ onLogout, onSessionExpired }) {
  const [activeTab,    setActiveTab]    = useState(0);
  const [employeeId,   setEmployeeId]   = useState('');
  const [refreshTick,  setRefreshTick]  = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('employeeId').then((id) => { if (id) setEmployeeId(id); });
  }, []);

  const handleApplied = useCallback(() => {
    setActiveTab(2);              // switch to History
    setRefreshTick((t) => t + 1); // trigger re-fetch
  }, []);

  if (!employeeId) return (
    <SafeAreaView style={s.root}>
      <ActivityIndicator color={C.brand} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>My Leaves</Text>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map((tab, i) => (
          <TouchableOpacity key={tab} style={[s.tabBtn, activeTab === i && s.tabBtnActive]} onPress={() => setActiveTab(i)}>
            <Text style={[s.tabLabel, activeTab === i && s.tabLabelActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 0 && <BalanceTab employeeId={employeeId} onSessionExpired={onSessionExpired} />}
        {activeTab === 1 && <ApplyTab   employeeId={employeeId} onSessionExpired={onSessionExpired} onApplied={handleApplied} />}
        {activeTab === 2 && <HistoryTab employeeId={employeeId} onSessionExpired={onSessionExpired} refreshTick={refreshTick} />}
        {activeTab === 3 && <HolidaysTab employeeId={employeeId} onSessionExpired={onSessionExpired} />}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },

  // Header
  header:    { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  logoutBtn:  { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Tab Bar
  tabBar:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: C.brand },
  tabLabel:       { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  tabLabelActive: { color: C.brand, fontWeight: '700' },

  // Balance
  balanceGrid:  { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  balCard:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: (SCREEN_W - 44) / 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  balType:      { fontSize: 13, color: C.textSecond, fontWeight: '600', marginBottom: 6 },
  balRow:       { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  balRemain:    { fontSize: 26, fontWeight: '800', color: C.brand },
  balTotal:     { fontSize: 13, color: C.textMuted },
  barBg:        { height: 6, backgroundColor: C.border, borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  barFill:      { height: 6, backgroundColor: C.brand, borderRadius: 3 },
  balMeta:      { flexDirection: 'row', justifyContent: 'space-between' },
  balMetaText:  { fontSize: 11, color: C.textMuted },
  balPending:   { fontSize: 11, color: C.warn, fontWeight: '600' },

  // Apply
  applyScroll:   { flex: 1 },
  applyContent:  { padding: 16, paddingBottom: 40 },
  fieldLabel:    { fontSize: 13, fontWeight: '600', color: C.textSecond, marginBottom: 6, marginTop: 14 },
  selectBtn:     { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectVal:     { fontSize: 15, color: C.textPrimary },
  selectPlaceholder: { fontSize: 15, color: C.textMuted },
  selectArrow:   { fontSize: 18, color: C.textMuted },
  dateRow:       { flexDirection: 'row' },
  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, borderWidth: 1, borderColor: C.border },
  switchLabel:   { fontSize: 15, color: C.textPrimary, fontWeight: '500' },
  textArea:      { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: C.border, fontSize: 15, color: C.textPrimary, minHeight: 90 },
  submitBtn:     { backgroundColor: C.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  submitText:    { color: '#fff', fontSize: 16, fontWeight: '700' },

  // History
  leaveRow:     { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', elevation: 1 },
  leaveMain:    { flex: 1 },
  leaveType:    { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 3 },
  leaveDates:   { fontSize: 13, color: C.textSecond, marginBottom: 2 },
  leaveReason:  { fontSize: 12, color: C.textMuted },
  leaveRight:   { alignItems: 'flex-end', gap: 6 },
  statusBadge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:   { fontSize: 12, fontWeight: '700' },
  leaveDays:    { fontSize: 13, fontWeight: '700', color: C.textSecond },

  // Holidays
  yearHeader:    { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  holidayRow:    { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  holidayDateBox: { width: 48, alignItems: 'center', marginRight: 12 },
  holidayDay:    { fontSize: 20, fontWeight: '800', color: C.brand },
  holidayMon:    { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  holidayInfo:   { flex: 1 },
  holidayName:   { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  holidayDow:    { fontSize: 12, color: C.textMuted, marginTop: 2 },
  weeklyBadge:   { backgroundColor: C.warnLight, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  weeklyText:    { fontSize: 11, color: C.warn, fontWeight: '600' },

  // Shared
  empty:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: C.textMuted, textAlign: 'center' },
});
