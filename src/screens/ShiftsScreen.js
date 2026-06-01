import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ScrollView, TextInput, ActivityIndicator,
  Alert, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../utils/theme';
import {
  getShiftAssignments, getShiftTypes, getShiftRequests, submitShiftRequest,
} from '../api/shiftApi';

const SCREEN_W = Dimensions.get('window').width;
const TABS = ['Schedule', 'Requests'];

// ── Date Picker Modal (reused from LeavesScreen pattern) ──────────────────────

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

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const monthLabel  = new Date(viewYear, viewMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

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
            <TouchableOpacity onPress={prevMonth} style={dp.navBtn}><Text style={dp.arrow}>‹</Text></TouchableOpacity>
            <Text style={dp.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={nextMonth} style={dp.navBtn}><Text style={dp.arrow}>›</Text></TouchableOpacity>
          </View>
          <View style={dp.weekRow}>
            {['S','M','T','W','T','F','S'].map((d, i) => <Text key={i} style={dp.weekDay}>{d}</Text>)}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={dp.row}>
              {row.map((day, ci) => (
                <TouchableOpacity key={ci} style={[dp.cell, isSelected(day) && dp.cellSel]} onPress={() => handleDay(day)} disabled={!day} activeOpacity={0.7}>
                  {day ? <Text style={[dp.cellText, isSelected(day) && dp.cellTextSel]}>{day}</Text> : null}
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

// ── Shift Type Picker ─────────────────────────────────────────────────────────

const ShiftTypePicker = memo(({ visible, shiftTypes, onSelect, onClose }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={stp.overlay}>
      <View style={stp.sheet}>
        <Text style={stp.title}>Select Shift Type</Text>
        <ScrollView>
          {shiftTypes.map((st) => (
            <TouchableOpacity key={st.name} style={stp.row} onPress={() => { onSelect(st.name); onClose(); }}>
              <Text style={stp.name}>{st.name}</Text>
              {(st.start_time || st.end_time) ? (
                <Text style={stp.time}>{st.start_time || ''} – {st.end_time || ''}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={stp.cancel} onPress={onClose}>
          <Text style={stp.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
));

const stp = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', padding: 20 },
  title:      { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  row:        { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between' },
  name:       { fontSize: 15, color: C.textPrimary },
  time:       { fontSize: 13, color: C.textMuted },
  cancel:     { marginTop: 14, alignItems: 'center', paddingVertical: 12, backgroundColor: C.bg, borderRadius: 10 },
  cancelText: { color: C.textSecond, fontSize: 14, fontWeight: '600' },
});

// ── Schedule Tab ──────────────────────────────────────────────────────────────

const AssignmentCard = memo(({ item }) => {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Ongoing';
  const today = new Date().toISOString().split('T')[0];
  const isCurrent = (!item.end_date || item.end_date >= today) && item.start_date <= today;

  return (
    <View style={[sa.card, isCurrent && sa.cardActive]}>
      {isCurrent && (
        <View style={sa.currentBadge}><Text style={sa.currentText}>Current Shift</Text></View>
      )}
      <Text style={sa.shiftName}>{item.shift_type}</Text>
      <View style={sa.dateRow}>
        <Text style={sa.dateLabel}>From</Text>
        <Text style={sa.dateVal}>{fmt(item.start_date)}</Text>
        <Text style={sa.dateLabel}> To </Text>
        <Text style={sa.dateVal}>{fmt(item.end_date)}</Text>
      </View>
    </View>
  );
});

const sa = StyleSheet.create({
  card:         { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, elevation: 1 },
  cardActive:   { borderLeftWidth: 4, borderLeftColor: C.brand },
  currentBadge: { backgroundColor: C.brandLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  currentText:  { fontSize: 12, color: C.brand, fontWeight: '700' },
  shiftName:    { fontSize: 17, fontWeight: '700', color: C.textPrimary, marginBottom: 8 },
  dateRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dateLabel:    { fontSize: 12, color: C.textMuted },
  dateVal:      { fontSize: 13, color: C.textSecond, fontWeight: '600' },
});

const ScheduleTab = memo(({ employeeId, onSessionExpired }) => {
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getShiftAssignments(employeeId);
      setAssignments(data);
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />;
  if (!assignments.length) return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>📅</Text>
      <Text style={s.emptyText}>No shift assignments found.</Text>
    </View>
  );

  return (
    <FlatList
      data={assignments}
      keyExtractor={(item) => item.name}
      renderItem={({ item }) => <AssignmentCard item={item} />}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.brand]} />}
    />
  );
});

// ── Requests Tab ──────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  Open:     { bg: C.warnLight,  text: C.warn },
  Approved: { bg: C.brandLight, text: C.brand },
  Rejected: { bg: C.errorLight, text: C.error },
};

const RequestCard = memo(({ item }) => {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const sc = STATUS_COLOR[item.status] || STATUS_COLOR.Open;
  return (
    <View style={sr.card}>
      <View style={sr.top}>
        <Text style={sr.shiftName}>{item.shift_type}</Text>
        <View style={[sr.badge, { backgroundColor: sc.bg }]}>
          <Text style={[sr.badgeText, { color: sc.text }]}>{item.status || 'Open'}</Text>
        </View>
      </View>
      <Text style={sr.dates}>{fmt(item.from_date)} → {fmt(item.to_date)}</Text>
    </View>
  );
});

const sr = StyleSheet.create({
  card:      { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1 },
  top:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  shiftName: { fontSize: 15, fontWeight: '700', color: C.textPrimary, flex: 1 },
  badge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  dates:     { fontSize: 13, color: C.textSecond, marginBottom: 4 },
  reason:    { fontSize: 13, color: C.textMuted },
});

// ── Request Form Modal ────────────────────────────────────────────────────────

const RequestFormModal = memo(({ visible, employeeId, onClose, onSubmitted }) => {
  const [shiftTypes,       setShiftTypes]       = useState([]);
  const [selectedType,     setSelectedType]     = useState('');
  const [fromDate,         setFromDate]         = useState('');
  const [toDate,           setToDate]           = useState('');
  const [reason,           setReason]           = useState('');
  const [submitting,       setSubmitting]       = useState(false);
  const [showTypePicker,   setShowTypePicker]   = useState(false);
  const [showFromPicker,   setShowFromPicker]   = useState(false);
  const [showToPicker,     setShowToPicker]     = useState(false);

  useEffect(() => {
    if (visible) getShiftTypes().then(setShiftTypes);
  }, [visible]);

  const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select date';

  const handleSubmit = async () => {
    if (!selectedType) return Alert.alert('Missing', 'Please select a shift type.');
    if (!fromDate)     return Alert.alert('Missing', 'Please select a start date.');
    if (!toDate)       return Alert.alert('Missing', 'Please select an end date.');
    if (toDate < fromDate) return Alert.alert('Invalid', 'End date cannot be before start date.');

    setSubmitting(true);
    try {
      await submitShiftRequest(employeeId, { shiftType: selectedType, fromDate, toDate, reason });
      Alert.alert('Success', 'Shift request submitted successfully.');
      setSelectedType(''); setFromDate(''); setToDate(''); setReason('');
      onSubmitted?.();
      onClose();
    } catch (e) {
      const msg = e.response?.data?._server_messages
        ? (() => { try { return JSON.parse(JSON.parse(e.response.data._server_messages)[0]).message; } catch { return e.message; } })()
        : e.message;
      Alert.alert('Error', msg || 'Could not submit shift request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={rf.root}>
        <View style={rf.header}>
          <TouchableOpacity onPress={onClose} style={rf.backBtn}>
            <Text style={rf.backArrow}>✕</Text>
          </TouchableOpacity>
          <Text style={rf.headerTitle}>Request Shift Change</Text>
        </View>
        <ScrollView style={rf.scroll} contentContainerStyle={rf.content} keyboardShouldPersistTaps="handled">
          <Text style={rf.fieldLabel}>Shift Type *</Text>
          <TouchableOpacity style={rf.selectBtn} onPress={() => setShowTypePicker(true)}>
            <Text style={selectedType ? rf.selectVal : rf.selectPlaceholder}>
              {selectedType || 'Select shift type'}
            </Text>
            <Text style={rf.selectArrow}>›</Text>
          </TouchableOpacity>

          <View style={rf.dateRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={rf.fieldLabel}>From Date *</Text>
              <TouchableOpacity style={rf.selectBtn} onPress={() => setShowFromPicker(true)}>
                <Text style={fromDate ? rf.selectVal : rf.selectPlaceholder}>{fmt(fromDate)}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rf.fieldLabel}>To Date *</Text>
              <TouchableOpacity style={rf.selectBtn} onPress={() => setShowToPicker(true)}>
                <Text style={toDate ? rf.selectVal : rf.selectPlaceholder}>{fmt(toDate)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={rf.fieldLabel}>Reason</Text>
          <TextInput
            style={rf.textArea}
            placeholder="Enter reason for shift change"
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={4}
            value={reason}
            onChangeText={setReason}
            textAlignVertical="top"
          />

          <TouchableOpacity style={[rf.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={rf.submitText}>Submit Request</Text>
            }
          </TouchableOpacity>
        </ScrollView>

        <ShiftTypePicker
          visible={showTypePicker}
          shiftTypes={shiftTypes}
          onSelect={setSelectedType}
          onClose={() => setShowTypePicker(false)}
        />
        <DatePickerModal
          visible={showFromPicker}
          title="From Date"
          selectedDate={fromDate}
          onSelect={(d) => { setFromDate(d); if (!toDate || toDate < d) setToDate(d); }}
          onClose={() => setShowFromPicker(false)}
        />
        <DatePickerModal
          visible={showToPicker}
          title="To Date"
          selectedDate={toDate || fromDate}
          onSelect={setToDate}
          onClose={() => setShowToPicker(false)}
        />
      </SafeAreaView>
    </Modal>
  );
});

const rf = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn:     { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backArrow:   { fontSize: 18, color: '#fff' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginLeft: 4 },
  scroll:      { flex: 1 },
  content:     { padding: 16, paddingBottom: 40 },
  fieldLabel:  { fontSize: 13, fontWeight: '600', color: C.textSecond, marginBottom: 6, marginTop: 14 },
  selectBtn:   { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectVal:   { fontSize: 15, color: C.textPrimary },
  selectPlaceholder: { fontSize: 15, color: C.textMuted },
  selectArrow: { fontSize: 18, color: C.textMuted },
  dateRow:     { flexDirection: 'row' },
  textArea:    { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: C.border, fontSize: 15, color: C.textPrimary, minHeight: 100 },
  submitBtn:   { backgroundColor: C.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  submitText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── Requests Tab ──────────────────────────────────────────────────────────────

const RequestsTab = memo(({ employeeId, onSessionExpired, refreshTick, onNewRequest }) => {
  const [requests,   setRequests]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getShiftRequests(employeeId);
      setRequests(data);
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load, refreshTick]);

  if (loading) return <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={requests}
      keyExtractor={(item) => item.name}
      renderItem={({ item }) => <RequestCard item={item} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.brand]} />}
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🔄</Text>
          <Text style={s.emptyText}>No shift requests yet.</Text>
        </View>
      }
      ListHeaderComponent={
        <TouchableOpacity style={s.newRequestBtn} onPress={onNewRequest}>
          <Text style={s.newRequestText}>+ New Shift Request</Text>
        </TouchableOpacity>
      }
    />
  );
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ShiftsScreen({ onLogout, onSessionExpired }) {
  const [activeTab,    setActiveTab]    = useState(0);
  const [employeeId,   setEmployeeId]   = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [refreshTick,  setRefreshTick]  = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('employeeId').then((id) => { if (id) setEmployeeId(id); });
  }, []);

  const handleSubmitted = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  if (!employeeId) return (
    <SafeAreaView style={s.root}>
      <ActivityIndicator color={C.brand} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>My Shifts</Text>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabBar}>
        {TABS.map((tab, i) => (
          <TouchableOpacity key={tab} style={[s.tabBtn, activeTab === i && s.tabBtnActive]} onPress={() => setActiveTab(i)}>
            <Text style={[s.tabLabel, activeTab === i && s.tabLabelActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 0 && (
          <ScheduleTab employeeId={employeeId} onSessionExpired={onSessionExpired} />
        )}
        {activeTab === 1 && (
          <RequestsTab
            employeeId={employeeId}
            onSessionExpired={onSessionExpired}
            refreshTick={refreshTick}
            onNewRequest={() => setShowForm(true)}
          />
        )}
      </View>

      <RequestFormModal
        visible={showForm}
        employeeId={employeeId}
        onClose={() => setShowForm(false)}
        onSubmitted={handleSubmitted}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  header:        { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle:   { fontSize: 20, fontWeight: '700', color: '#fff' },
  logoutBtn:     { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  logoutText:    { color: '#fff', fontSize: 13, fontWeight: '600' },
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:        { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:  { borderBottomWidth: 2, borderBottomColor: C.brand },
  tabLabel:      { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  tabLabelActive: { color: C.brand, fontWeight: '700' },
  newRequestBtn: { backgroundColor: C.brand, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 14 },
  newRequestText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  empty:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 40 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyText:     { fontSize: 15, color: C.textMuted, textAlign: 'center' },
});
