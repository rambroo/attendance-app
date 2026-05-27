import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
  TouchableOpacity, StatusBar, Alert,
} from 'react-native';
import { C } from '../utils/theme';
import {
  getAttendanceHistory,
  getMonthSummary,
  getCachedEmployee,
  formatDisplayDate,
  formatTime,
  formatHours,
} from '../api/attendanceApi';

const STATUS_COLORS = {
  Present:    { bg: '#E8F9F3', text: '#1A6B47', dot: '#3CC88F' },
  Absent:     { bg: '#FFEBEE', text: '#991B1B', dot: '#E53935' },
  'Half Day': { bg: '#FEF9C3', text: '#854D0E', dot: '#CA8A04' },
  'On Leave': { bg: '#DBEAFE', text: '#1E40AF', dot: '#2563EB' },
  Holiday:    { bg: '#F3E8FF', text: '#6B21A8', dot: '#9333EA' },
};

// ─── Memoized sub-components ──────────────────────────────────────────────────

const StatusBadge = memo(({ status }) => {
  const col = STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#374151', dot: '#6B7280' };
  return (
    <View style={[styles.badge, { backgroundColor: col.bg }]}>
      <Text style={[styles.badgeText, { color: col.text }]}>{status}</Text>
    </View>
  );
});

const AttendanceRow = memo(({ item }) => (
  <View style={styles.row}>
    <View style={styles.rowLeft}>
      <Text style={styles.rowDate}>{formatDisplayDate(item.attendance_date)}</Text>
      <View style={styles.rowTimes}>
        {item.in_time  ? <Text style={styles.rowTimeIn}>IN {formatTime(item.in_time)}</Text>   : null}
        {item.out_time ? <Text style={styles.rowTimeOut}>  OUT {formatTime(item.out_time)}</Text> : null}
      </View>
      {item.working_hours > 0
        ? <Text style={styles.rowHours}>{formatHours(item.working_hours)} worked</Text>
        : null}
    </View>
    <View style={styles.rowRight}>
      <StatusBadge status={item.status} />
      <View style={styles.rowFlags}>
        {item.late_entry  ? <Text style={styles.flagText}>Late</Text>       : null}
        {item.early_exit  ? <Text style={styles.flagText}>Early Exit</Text> : null}
      </View>
    </View>
  </View>
));

const SummaryCard = memo(({ label, value, color }) => (
  <View style={[styles.summaryCard, { borderTopColor: color }]}>
    <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </View>
));

// ─── Screen ───────────────────────────────────────────────────────────────────
const HistoryScreen = ({ onLogout, onSessionExpired }) => {
  const [records, setRecords]     = useState([]);
  const [summary, setSummary]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [limit, setLimit]         = useState(30);
  const [isOffline, setIsOffline] = useState(false);

  const handleSessionExpired = useCallback(() => {
    if (onSessionExpired) onSessionExpired();
  }, [onSessionExpired]);

  const loadHistory = useCallback(async (lim = 30, showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const emp = await getCachedEmployee();
      if (!emp) throw new Error('Employee not found. Please reload the app.');

      const [history, monthData] = await Promise.all([
        getAttendanceHistory(emp.name, lim),
        getMonthSummary(emp.name),
      ]);
      setRecords(history);
      setSummary(monthData);
      setIsOffline(false);
    } catch (err) {
      if (err.sessionExpired) { handleSessionExpired(); return; }
      setIsOffline(true);
      if (!records.length) setError(err.message || 'Failed to load history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [handleSessionExpired]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHistory(30, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory(limit, false);
  }, [loadHistory, limit]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore) return;
    setLoadingMore(true);
    const newLimit = limit + 30;
    setLimit(newLimit);
    loadHistory(newLimit, false);
  }, [loadingMore, limit, loadHistory]);

  const renderItem = useCallback(({ item }) => <AttendanceRow item={item} />, []);
  const keyExtractor = useCallback((item) => item.name, []);

  const currentMonthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const ListHeader = useCallback(() => (
    <View>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Attendance History</Text>
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineBadgeText}>⚡ Offline</Text>
          </View>
        )}
      </View>

      {summary && (
        <View style={styles.summarySection}>
          <Text style={styles.summarySectionTitle}>{currentMonthName}</Text>
          <View style={styles.summaryRow}>
            <SummaryCard label="Present"  value={summary.present}  color={C.in} />
            <SummaryCard label="Absent"   value={summary.absent}   color={C.out} />
            <SummaryCard label="Half Day" value={summary.halfDay}  color="#CA8A04" />
            <SummaryCard label="On Leave" value={summary.onLeave}  color="#2563EB" />
          </View>
          <View style={styles.hoursCard}>
            <Text style={styles.hoursLabel}>Total Hours This Month</Text>
            <Text style={styles.hoursValue}>{formatHours(summary.totalHours)}</Text>
          </View>
        </View>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadHistory(limit)}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.listHeader}>Last {records.length} Records</Text>
    </View>
  ), [summary, error, isOffline, records.length, currentMonthName, loadHistory, limit]);

  const ListEmpty = useCallback(() => (
    loading ? null : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>No attendance records</Text>
        <Text style={styles.emptySubtitle}>
          Your attendance history will appear here once records are processed.
        </Text>
      </View>
    )
  ), [loading]);

  const ListFooter = useCallback(() =>
    records.length > 0 ? (
      <View style={styles.footer}>
        {loadingMore ? (
          <ActivityIndicator size="small" color={C.brand} />
        ) : (
          <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
            <Text style={styles.loadMoreText}>Load More</Text>
          </TouchableOpacity>
        )}
      </View>
    ) : null,
    [records.length, loadingMore, handleLoadMore]
  );

  if (loading && !records.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Loading history…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />
      <FlatList
        data={records}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.brand} />
        }
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        ItemSeparatorComponent={null}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={15}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  loadingText: { marginTop: 12, fontSize: 15, color: C.textMuted },

  pageHeader: {
    backgroundColor: C.primary,
    paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  offlineBadge: {
    backgroundColor: 'rgba(245,158,11,0.25)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50,
  },
  offlineBadgeText: { fontSize: 11, color: '#FDE68A', fontWeight: '600' },

  summarySection: {
    backgroundColor: C.card, margin: 16, borderRadius: 16, padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07,
    shadowRadius: 6, elevation: 3,
  },
  summarySectionTitle: {
    fontSize: 13, fontWeight: '700', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCard: {
    flex: 1, backgroundColor: C.bg, borderRadius: 10,
    padding: 10, alignItems: 'center', borderTopWidth: 3,
  },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: {
    fontSize: 9, color: C.textMuted, marginTop: 2,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  hoursCard: {
    backgroundColor: C.primary, borderRadius: 10, padding: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  hoursLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  hoursValue: { fontSize: 18, fontWeight: '800', color: '#fff' },

  errorBox: {
    backgroundColor: C.errorLight, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14,
    borderLeftWidth: 3, borderLeftColor: C.out,
  },
  errorText: { color: '#991B1B', fontSize: 13 },
  retryText: { color: C.out, fontSize: 12, fontWeight: '600', marginTop: 6 },

  listHeader: {
    fontSize: 11, fontWeight: '700', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  listContent: { paddingBottom: 30 },

  row: {
    backgroundColor: C.card,
    marginHorizontal: 16, marginVertical: 4,
    borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04,
    shadowRadius: 3, elevation: 1,
  },
  rowLeft:    { flex: 1, marginRight: 12 },
  rowDate:    { fontSize: 14, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
  rowTimes:   { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 },
  rowTimeIn:  { fontSize: 12, color: C.in,  fontWeight: '600' },
  rowTimeOut: { fontSize: 12, color: C.out, fontWeight: '600' },
  rowHours:   { fontSize: 11, color: C.textMuted, marginTop: 2 },
  rowRight:   { alignItems: 'flex-end' },

  badge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  rowFlags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },
  flagText: {
    fontSize: 10, color: C.warn, fontWeight: '600',
    backgroundColor: C.warnLight,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },

  emptyState:    { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon:     { fontSize: 40, marginBottom: 12 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: C.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },

  footer:       { padding: 20, alignItems: 'center' },
  loadMoreBtn:  {
    paddingHorizontal: 28, paddingVertical: 10,
    borderRadius: 50, borderWidth: 1.5, borderColor: C.brand,
  },
  loadMoreText: { color: C.brand, fontSize: 13, fontWeight: '600' },
});

export default HistoryScreen;
