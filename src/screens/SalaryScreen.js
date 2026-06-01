import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../utils/theme';
import { getSalarySlips, getSalarySlipDetail } from '../api/payrollApi';

// ── Salary Slip Detail Modal ──────────────────────────────────────────────────

const SlipDetail = memo(({ visible, slip, onClose }) => {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && slip) {
      setLoading(true);
      setDetail(null);
      getSalarySlipDetail(slip.name)
        .then(setDetail)
        .catch(() => setDetail(slip)) // fallback: use list data
        .finally(() => setLoading(false));
    }
  }, [visible, slip]);

  const fmt = (n) => {
    if (!n && n !== 0) return '—';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const period = () => {
    if (!slip) return '';
    if (slip.start_date) {
      const s = new Date(slip.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const e = slip.end_date ? new Date(slip.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      return e ? `${s} – ${e}` : s;
    }
    return slip.name;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={sd.root}>
        {/* Header */}
        <View style={sd.header}>
          <TouchableOpacity onPress={onClose} style={sd.backBtn}>
            <Text style={sd.backArrow}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={sd.headerTitle}>Salary Slip</Text>
            {slip && <Text style={sd.headerSub}>{period()}</Text>}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 60 }} />
        ) : detail ? (
          <ScrollView contentContainerStyle={sd.body}>
            {/* Net Pay Hero */}
            <View style={sd.netCard}>
              <Text style={sd.netLabel}>Net Pay</Text>
              <Text style={sd.netAmount}>{detail.currency || '₹'} {fmt(detail.net_pay)}</Text>
              <Text style={sd.netPeriod}>{period()}</Text>
            </View>

            {/* Summary Row */}
            <View style={sd.summaryRow}>
              <View style={sd.summaryItem}>
                <Text style={sd.summaryLabel}>Gross Pay</Text>
                <Text style={sd.summaryVal}>{fmt(detail.gross_pay)}</Text>
              </View>
              <View style={sd.summaryDivider} />
              <View style={sd.summaryItem}>
                <Text style={sd.summaryLabel}>Deductions</Text>
                <Text style={[sd.summaryVal, { color: C.error }]}>{fmt(detail.total_deduction)}</Text>
              </View>
            </View>

            {/* Earnings */}
            {detail.earnings?.length ? (
              <View style={sd.section}>
                <Text style={sd.sectionTitle}>Earnings</Text>
                {detail.earnings.map((e, i) => (
                  <View key={i} style={sd.lineRow}>
                    <Text style={sd.lineLabel}>{e.salary_component}</Text>
                    <Text style={sd.lineVal}>{fmt(e.amount)}</Text>
                  </View>
                ))}
                <View style={sd.totalRow}>
                  <Text style={sd.totalLabel}>Total Earnings</Text>
                  <Text style={sd.totalVal}>{fmt(detail.gross_pay)}</Text>
                </View>
              </View>
            ) : null}

            {/* Deductions */}
            {detail.deductions?.length ? (
              <View style={sd.section}>
                <Text style={sd.sectionTitle}>Deductions</Text>
                {detail.deductions.map((d, i) => (
                  <View key={i} style={sd.lineRow}>
                    <Text style={sd.lineLabel}>{d.salary_component}</Text>
                    <Text style={[sd.lineVal, { color: C.error }]}>{fmt(d.amount)}</Text>
                  </View>
                ))}
                <View style={sd.totalRow}>
                  <Text style={sd.totalLabel}>Total Deductions</Text>
                  <Text style={[sd.totalVal, { color: C.error }]}>{fmt(detail.total_deduction)}</Text>
                </View>
              </View>
            ) : null}

            {/* Working days info */}
            {(detail.total_working_days || detail.payment_days) ? (
              <View style={sd.section}>
                <Text style={sd.sectionTitle}>Attendance</Text>
                {detail.total_working_days ? (
                  <View style={sd.lineRow}>
                    <Text style={sd.lineLabel}>Working Days</Text>
                    <Text style={sd.lineVal}>{detail.total_working_days}</Text>
                  </View>
                ) : null}
                {detail.payment_days ? (
                  <View style={sd.lineRow}>
                    <Text style={sd.lineLabel}>Payment Days</Text>
                    <Text style={sd.lineVal}>{detail.payment_days}</Text>
                  </View>
                ) : null}
                {detail.leave_without_pay != null ? (
                  <View style={sd.lineRow}>
                    <Text style={sd.lineLabel}>Leave Without Pay</Text>
                    <Text style={sd.lineVal}>{detail.leave_without_pay}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
});

const sd = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  header:        { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  backBtn:       { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backArrow:     { fontSize: 30, color: '#fff', lineHeight: 34 },
  headerTitle:   { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSub:     { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  body:          { padding: 16, paddingBottom: 40 },

  netCard:       { backgroundColor: C.primary, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  netLabel:      { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 4 },
  netAmount:     { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 4 },
  netPeriod:     { fontSize: 13, color: 'rgba(255,255,255,0.65)' },

  summaryRow:    { backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', padding: 16, marginBottom: 16, elevation: 1 },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryLabel:  { fontSize: 12, color: C.textMuted, marginBottom: 4 },
  summaryVal:    { fontSize: 18, fontWeight: '700', color: C.textPrimary },
  summaryDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 8 },

  section:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 1 },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: C.textSecond, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  lineRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  lineLabel:     { fontSize: 14, color: C.textPrimary, flex: 1 },
  lineVal:       { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  totalRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4 },
  totalLabel:    { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  totalVal:      { fontSize: 14, fontWeight: '700', color: C.brand },
});

// ── Slip List Item ────────────────────────────────────────────────────────────

const SlipCard = memo(({ item, onPress }) => {
  const period = () => {
    if (item.start_date) {
      return new Date(item.start_date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    return item.name;
  };
  const fmt = (n) => n ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
  const isDraft = item.docstatus === 0;

  return (
    <TouchableOpacity style={sc.card} onPress={onPress} activeOpacity={0.7}>
      <View style={sc.left}>
        <Text style={sc.period}>{period()}</Text>
        <View style={sc.metaRow}>
          <Text style={sc.metaText}>Gross: {fmt(item.gross_pay)}</Text>
          <Text style={sc.metaDot}> · </Text>
          <Text style={[sc.metaText, { color: C.error }]}>Ded: {fmt(item.total_deduction)}</Text>
        </View>
      </View>
      <View style={sc.right}>
        <Text style={sc.net}>{fmt(item.net_pay)}</Text>
        <Text style={sc.netLabel}>Net Pay</Text>
        {isDraft && <View style={sc.draftBadge}><Text style={sc.draftText}>Draft</Text></View>}
      </View>
      <Text style={sc.chevron}>›</Text>
    </TouchableOpacity>
  );
});

const sc = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  left:       { flex: 1 },
  period:     { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
  metaRow:    { flexDirection: 'row', alignItems: 'center' },
  metaText:   { fontSize: 12, color: C.textSecond },
  metaDot:    { fontSize: 12, color: C.textMuted },
  right:      { alignItems: 'flex-end', marginRight: 8 },
  net:        { fontSize: 18, fontWeight: '800', color: C.brand },
  netLabel:   { fontSize: 11, color: C.textMuted },
  draftBadge: { backgroundColor: C.warnLight, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  draftText:  { fontSize: 11, color: C.warn, fontWeight: '600' },
  chevron:    { fontSize: 22, color: C.textMuted },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SalaryScreen({ onLogout, onSessionExpired }) {
  const [slips,       setSlips]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [employeeId,  setEmployeeId]  = useState('');
  const [selectedSlip, setSelectedSlip] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('employeeId').then((id) => { if (id) setEmployeeId(id); });
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (!employeeId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getSalarySlips(employeeId);
      setSlips(data);
    } catch (e) {
      if (e.sessionExpired) onSessionExpired?.();
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => { if (employeeId) load(); }, [employeeId, load]);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>My Salary</Text>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 60 }} />
      ) : slips.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>💰</Text>
          <Text style={s.emptyText}>No salary slips found.</Text>
          <Text style={s.emptySubText}>Salary slips will appear here once processed by HR.</Text>
        </View>
      ) : (
        <FlatList
          data={slips}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <SlipCard item={item} onPress={() => setSelectedSlip(item)} />
          )}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.brand]} />
          }
          ListHeaderComponent={
            <Text style={s.listHeader}>{slips.length} slip{slips.length !== 1 ? 's' : ''} found</Text>
          }
        />
      )}

      <SlipDetail
        visible={!!selectedSlip}
        slip={selectedSlip}
        onClose={() => setSelectedSlip(null)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle:  { fontSize: 20, fontWeight: '700', color: '#fff' },
  logoutBtn:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  logoutText:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  listHeader:   { fontSize: 13, color: C.textMuted, marginBottom: 10 },
  empty:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon:    { fontSize: 52, marginBottom: 12 },
  emptyText:    { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 6 },
  emptySubText: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
});
