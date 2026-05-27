import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { C } from '../utils/theme';
import {
  getMonthAttendance,
  getCachedEmployee,
  formatTime,
  formatHours,
} from '../api/attendanceApi';

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STATUS_STYLE = {
  Present:    { bg: '#E8F9F3', text: '#1A6B47' },
  Absent:     { bg: '#FFEBEE', text: '#991B1B' },
  'Half Day': { bg: '#FEF9C3', text: '#854D0E' },
  'On Leave': { bg: '#DBEAFE', text: '#1E40AF' },
  Holiday:    { bg: '#F3E8FF', text: '#6B21A8' },
};

// YYYY-MM-DD string from a Date object (local time, no UTC drift)
const toDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── Day Row ───────────────────────────────────────────────────────────────────

const DayRow = memo(({ date, record, isToday, isFuture }) => {
  const dayName  = DAY_ABBR[date.getDay()];
  const dayNum   = date.getDate();
  const isSunday = date.getDay() === 0;
  const col      = record ? (STATUS_STYLE[record.status] || { bg: '#F3F4F6', text: '#374151' }) : null;

  return (
    <View style={[
      S.row,
      isToday  && S.rowToday,
      isSunday && !record && S.rowSunday,
    ]}>
      {/* Date column */}
      <View style={S.dateCol}>
        <Text style={[S.dayName, isFuture && S.dimText, isSunday && S.sundayText]}>
          {dayName}
        </Text>
        <Text style={[S.dayNum, isToday && S.todayNum, isFuture && S.dimText]}>
          {dayNum}
        </Text>
      </View>

      {/* Status column */}
      <View style={S.statusCol}>
        {record ? (
          <View style={[S.badge, { backgroundColor: col.bg }]}>
            <Text style={[S.badgeText, { color: col.text }]}>{record.status}</Text>
          </View>
        ) : !isFuture ? (
          <Text style={S.dash}>—</Text>
        ) : null}
        {record?.late_entry  ? <Text style={S.flag}>Late</Text>       : null}
        {record?.early_exit  ? <Text style={S.flag}>Early Exit</Text> : null}
      </View>

      {/* Times column */}
      <View style={S.timesCol}>
        {record?.in_time  ? (
          <Text style={[S.time, { color: C.in }]}>▲ {formatTime(record.in_time)}</Text>
        ) : null}
        {record?.out_time ? (
          <Text style={[S.time, { color: C.out }]}>▼ {formatTime(record.out_time)}</Text>
        ) : null}
        {record?.working_hours > 0 ? (
          <Text style={S.hours}>{formatHours(record.working_hours)}</Text>
        ) : null}
      </View>
    </View>
  );
});

// ── Screen ────────────────────────────────────────────────────────────────────

const now = new Date();

const HistoryScreen = ({ onLogout, onSessionExpired }) => {
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [records,   setRecords]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState('');
  const [isOffline, setIsOffline] = useState(false);

  const handleSessionExpired = useCallback(() => {
    if (onSessionExpired) onSessionExpired();
  }, [onSessionExpired]);

  const loadData = useCallback(async (year, month, showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const emp = await getCachedEmployee();
      if (!emp) throw new Error('Employee not found. Please reload the app.');
      const data = await getMonthAttendance(emp.name, year, month);
      setRecords(data);
      setIsOffline(false);
    } catch (err) {
      if (err.sessionExpired) { handleSessionExpired(); return; }
      setIsOffline(true);
      if (!records.length) setError(err.message || 'Failed to load attendance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleSessionExpired]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData(selectedYear, selectedMonth, true);
  }, [selectedYear, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Month navigation ────────────────────────────────────────────────────────

  const canGoNext = selectedYear < now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonth < now.getMonth() + 1);

  const goPrev = useCallback(() => {
    setRecords([]);
    if (selectedMonth === 1) { setSelectedYear(y => y - 1); setSelectedMonth(12); }
    else                     { setSelectedMonth(m => m - 1); }
  }, [selectedMonth]);

  const goNext = useCallback(() => {
    if (!canGoNext) return;
    setRecords([]);
    if (selectedMonth === 12) { setSelectedYear(y => y + 1); setSelectedMonth(1); }
    else                      { setSelectedMonth(m => m + 1); }
  }, [selectedMonth, canGoNext]);

  // ── Derived data ────────────────────────────────────────────────────────────

  // All days in the selected month as Date objects
  const days = useMemo(() => {
    const count = new Date(selectedYear, selectedMonth, 0).getDate();
    return Array.from({ length: count }, (_, i) => new Date(selectedYear, selectedMonth - 1, i + 1));
  }, [selectedYear, selectedMonth]);

  // Map attendance_date → record
  const recordMap = useMemo(() => {
    const m = {};
    records.forEach(r => { m[r.attendance_date] = r; });
    return m;
  }, [records]);

  // Summary totals
  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, halfDay: 0, onLeave: 0, totalHours: 0 };
    records.forEach(r => {
      if      (r.status === 'Present')  s.present++;
      else if (r.status === 'Absent')   s.absent++;
      else if (r.status === 'Half Day') s.halfDay++;
      else if (r.status === 'On Leave') s.onLeave++;
      s.totalHours += parseFloat(r.working_hours || 0);
    });
    return s;
  }, [records]);

  const todayKey = toDateKey(now);
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderDay = useCallback(({ item: date }) => {
    const key    = toDateKey(date);
    const record = recordMap[key];
    const isToday  = key === todayKey;
    const isFuture = !isCurrentMonth ? false : date > now;
    return <DayRow date={date} record={record} isToday={isToday} isFuture={isFuture} />;
  }, [recordMap, todayKey, isCurrentMonth]);

  const keyExtractor = useCallback((date) => toDateKey(date), []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(selectedYear, selectedMonth, false);
  }, [loadData, selectedYear, selectedMonth]);

  // ── Header component ────────────────────────────────────────────────────────

  const ListHeader = useCallback(() => (
    <View>
      {/* Page header */}
      <View style={S.pageHeader}>
        <Text style={S.pageTitle}>Attendance</Text>
        {isOffline && (
          <View style={S.offlineBadge}>
            <Text style={S.offlineText}>⚡ Offline</Text>
          </View>
        )}
      </View>

      {/* Month navigator */}
      <View style={S.monthNav}>
        <TouchableOpacity onPress={goPrev} style={S.navBtn} activeOpacity={0.7}>
          <Text style={S.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={S.monthLabel}>
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </Text>
        <TouchableOpacity
          onPress={goNext}
          style={[S.navBtn, !canGoNext && S.navBtnDisabled]}
          disabled={!canGoNext}
          activeOpacity={0.7}
        >
          <Text style={[S.navArrow, !canGoNext && S.navArrowDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={S.summaryCard}>
        <View style={S.summaryRow}>
          {[
            { label: 'Present',  value: summary.present,  color: C.in },
            { label: 'Absent',   value: summary.absent,   color: C.out },
            { label: 'Half Day', value: summary.halfDay,  color: '#CA8A04' },
            { label: 'On Leave', value: summary.onLeave,  color: '#2563EB' },
          ].map(({ label, value, color }) => (
            <View key={label} style={[S.summaryItem, { borderTopColor: color }]}>
              <Text style={[S.summaryValue, { color }]}>{value}</Text>
              <Text style={S.summaryLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {summary.totalHours > 0 && (
          <View style={S.hoursRow}>
            <Text style={S.hoursLabel}>Total hours</Text>
            <Text style={S.hoursValue}>{formatHours(summary.totalHours)}</Text>
          </View>
        )}
      </View>

      {/* Column headings */}
      <View style={S.colHeaders}>
        <Text style={[S.colHeader, { width: 52 }]}>Day</Text>
        <Text style={[S.colHeader, { flex: 1 }]}>Status</Text>
        <Text style={[S.colHeader, { width: 100, textAlign: 'right' }]}>In / Out</Text>
      </View>

      {error ? (
        <TouchableOpacity
          style={S.errorBox}
          onPress={() => loadData(selectedYear, selectedMonth)}
        >
          <Text style={S.errorText}>{error}  ·  Tap to retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ), [
    isOffline, goPrev, goNext, canGoNext,
    selectedMonth, selectedYear, summary,
    error, loadData,
  ]);

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={S.centered}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={S.loadingText}>Loading…</Text>
      </View>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />
      <FlatList
        data={days}
        keyExtractor={keyExtractor}
        renderItem={renderDay}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.brand} />
        }
        contentContainerStyle={S.listContent}
        removeClippedSubviews
        maxToRenderPerBatch={15}
        windowSize={5}
        initialNumToRender={31}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  loadingText: { marginTop: 12, fontSize: 15, color: C.textMuted },
  listContent: { paddingBottom: 30 },

  // Header
  pageHeader: {
    backgroundColor: C.primary,
    paddingTop: 50, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pageTitle:   { fontSize: 22, fontWeight: '800', color: '#fff' },
  offlineBadge: {
    backgroundColor: 'rgba(245,158,11,0.25)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50,
  },
  offlineText: { fontSize: 11, color: '#FDE68A', fontWeight: '600' },

  // Month navigator
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.primary,
    paddingHorizontal: 8, paddingBottom: 20,
  },
  navBtn:          { padding: 10 },
  navBtnDisabled:  { opacity: 0.3 },
  navArrow:        { fontSize: 32, color: '#fff', fontWeight: '300', lineHeight: 34 },
  navArrowDisabled: { color: 'rgba(255,255,255,0.4)' },
  monthLabel:      { fontSize: 18, fontWeight: '800', color: '#fff' },

  // Summary card
  summaryCard: {
    backgroundColor: C.card, marginHorizontal: 16, marginTop: 14,
    borderRadius: 16, padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07,
    shadowRadius: 6, elevation: 3,
  },
  summaryRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryItem: {
    flex: 1, backgroundColor: C.bg, borderRadius: 10,
    padding: 10, alignItems: 'center', borderTopWidth: 3,
  },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: {
    fontSize: 9, color: C.textMuted, marginTop: 2,
    textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center',
  },
  hoursRow: {
    backgroundColor: C.primary, borderRadius: 10, padding: 11,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  hoursLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  hoursValue: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Column headings
  colHeaders: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },
  colHeader: {
    fontSize: 10, fontWeight: '700', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Error
  errorBox: {
    backgroundColor: C.errorLight, marginHorizontal: 16, marginVertical: 8,
    borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: C.out,
  },
  errorText: { color: '#991B1B', fontSize: 12, fontWeight: '500' },

  // Day row
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 16, marginVertical: 2,
    borderRadius: 12, padding: 12,
    minHeight: 56,
  },
  rowToday: {
    borderWidth: 1.5, borderColor: C.brand,
  },
  rowSunday: { backgroundColor: '#FAFAFA' },

  // Date column
  dateCol: { width: 52, alignItems: 'center' },
  dayName:  { fontSize: 10, color: C.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  dayNum:   { fontSize: 20, fontWeight: '800', color: C.textPrimary, lineHeight: 24 },
  todayNum: { color: C.brand },
  sundayText: { color: '#E53935' },
  dimText:  { color: C.textMuted, opacity: 0.4 },

  // Status column
  statusCol: { flex: 1, paddingHorizontal: 8, justifyContent: 'center' },
  badge:     { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  dash:      { fontSize: 16, color: C.textMuted, opacity: 0.4 },
  flag: {
    alignSelf: 'flex-start', marginTop: 3,
    fontSize: 9, color: '#854D0E', fontWeight: '700',
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },

  // Times column
  timesCol:  { width: 100, alignItems: 'flex-end', justifyContent: 'center' },
  time:      { fontSize: 11, fontWeight: '600' },
  hours:     { fontSize: 10, color: C.textMuted, marginTop: 2 },
});

export default HistoryScreen;
