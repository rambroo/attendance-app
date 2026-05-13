import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
  RefreshControl, StatusBar, Animated,
} from 'react-native';
import { C } from '../utils/theme';
import {
  getEmployeeByEmail,
  getCachedEmployee,
  getCachedTodayCheckins,
  getTodayCheckins,
  createCheckin,
  getNextPunchType,
  calcWorkingHours,
  formatHours,
  formatDate,
  formatTime,
} from '../api/attendanceApi';
import { getStoredUser } from '../api/authApi';
import PunchModal from '../components/PunchModal';

// ─── Live Clock — isolated so the 1s tick doesn't re-render HomeScreen ────────
const LiveClock = memo(() => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const secStr = String(now.getSeconds()).padStart(2, '0');

  return (
    <View style={clockS.wrap}>
      <Text style={clockS.date}>{dateStr}</Text>
      <Text style={clockS.time}>{timeStr}</Text>
      <Text style={clockS.sec}>{secStr} sec</Text>
    </View>
  );
});

const clockS = StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: 4 },
  date: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 4 },
  time: { fontSize: 48, fontWeight: '800', color: '#fff', letterSpacing: 1, lineHeight: 56 },
  sec:  { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
});

// ─── Power Icon ───────────────────────────────────────────────────────────────
const PowerIcon = memo(({ color }) => (
  <View style={powerS.container}>
    <View style={[powerS.ring, { borderColor: color }]} />
    <View style={[powerS.stem, { backgroundColor: color }]} />
  </View>
));

const powerS = StyleSheet.create({
  container: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  ring: {
    position: 'absolute', width: 36, height: 36, borderRadius: 18,
    borderWidth: 4, borderTopColor: 'transparent', transform: [{ rotate: '45deg' }],
  },
  stem: { position: 'absolute', top: 1, width: 5, height: 16, borderRadius: 3 },
});

// ─── Punch Button — memoized, has its own animation refs ─────────────────────
const PunchButton = memo(({ isPunchIn, onPress, disabled }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true }),
          Animated.timing(glowAnim,  { toValue: 0.15, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 900, useNativeDriver: true }),
          Animated.timing(glowAnim,  { toValue: 0.4,  duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isPunchIn]);

  const accent = isPunchIn ? C.in : C.out;

  return (
    <View style={styles.punchWrapper}>
      <Animated.View style={[
        styles.pulseRing,
        { borderColor: accent, opacity: glowAnim, transform: [{ scale: pulseAnim }] },
      ]} />
      <View style={[styles.middleRing, { borderColor: accent }]} />
      <TouchableOpacity
        style={[styles.punchCircle, { backgroundColor: accent }]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.82}
      >
        {disabled ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <>
            <PowerIcon color="#fff" />
            <Text style={styles.punchLabel}>{isPunchIn ? 'PUNCH IN' : 'PUNCH OUT'}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const HomeScreen = ({ onLogout }) => {
  const employeeRef = useRef(null); // avoids stale-closure in loadData

  const [employee, setEmployee]         = useState(null);
  const [checkins, setCheckins]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [punching, setPunching]         = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState('');
  const [lastMsg, setLastMsg]           = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [isOffline, setIsOffline]       = useState(false);

  const saveEmployee = useCallback((emp) => {
    employeeRef.current = emp;
    setEmployee(emp);
  }, []);

  const handleSessionExpired = useCallback(() => {
    Alert.alert(
      'Session Expired',
      'Your session has expired. Please log in again.',
      [{ text: 'OK', onPress: onLogout }]
    );
  }, [onLogout]);

  const loadData = useCallback(async (showLoader = true) => {
    setError('');

    // Phase 1 — instant render from cache (only on cold start)
    if (showLoader && !employeeRef.current) {
      const cachedEmp = await getCachedEmployee();
      if (cachedEmp) {
        saveEmployee(cachedEmp);
        const cachedLogs = await getCachedTodayCheckins(cachedEmp.name);
        if (cachedLogs) setCheckins(cachedLogs);
        setLoading(false); // show cached data, network loads silently below
      }
    }

    // Phase 2 — network refresh
    try {
      const { email } = await getStoredUser();
      let emp = employeeRef.current;
      if (!emp) {
        setLoading(true); // no cache — show spinner
        emp = await getEmployeeByEmail(email);
        if (!emp) throw new Error('Employee record not found. Contact HR.');
        saveEmployee(emp);
      }
      const today = formatDate(new Date());
      const logs  = await getTodayCheckins(emp.name, today);
      setCheckins(logs);
      setIsOffline(false);
    } catch (err) {
      if (err.sessionExpired) { handleSessionExpired(); return; }
      setIsOffline(true);
      // Only show error if we have nothing to display
      if (!employeeRef.current) setError(err.message || 'Failed to load. Tap to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [saveEmployee, handleSessionExpired]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(false);
  }, [loadData]);

  const handleOpenModal = useCallback(() => {
    if (!employeeRef.current) return;
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => setModalVisible(false), []);

  const handleModalConfirm = useCallback(async ({ photo, location }) => {
    const emp     = employeeRef.current;
    const logType = getNextPunchType(checkins);
    setPunching(true);
    setLastMsg('');
    try {
      await createCheckin(emp.name, logType, { photo, location });
      setModalVisible(false);
      const logs = await getTodayCheckins(emp.name, formatDate(new Date()));
      setCheckins(logs);
      const t = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      setLastMsg(logType === 'IN' ? `Checked In at ${t}` : `Checked Out at ${t}`);
    } catch (err) {
      setModalVisible(false);
      if (err.sessionExpired) { handleSessionExpired(); return; }
      Alert.alert('Punch Failed', err.message || 'Could not record attendance.');
    } finally {
      setPunching(false);
    }
  }, [checkins, handleSessionExpired]);

  const getGreeting = useCallback(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Loading attendance…</Text>
      </View>
    );
  }

  const nextType      = getNextPunchType(checkins);
  const isPunchIn     = nextType === 'IN';
  const isCurrentlyIn = checkins.length > 0 && checkins[checkins.length - 1].log_type === 'IN';
  const hoursWorked   = calcWorkingHours(checkins);
  const firstIn       = checkins.find((c) => c.log_type === 'IN');
  const lastOut       = [...checkins].reverse().find((c) => c.log_type === 'OUT');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <PunchModal
        visible={modalVisible}
        logType={nextType}
        onConfirm={handleModalConfirm}
        onCancel={handleCloseModal}
        punching={punching}
      />

      {/* ── Header ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(employee?.employee_name || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.greetingText}>{getGreeting()},</Text>
            <Text style={styles.nameText}>{employee?.employee_name || '—'}</Text>
            {employee?.designation
              ? <Text style={styles.designText}>{employee.designation}</Text>
              : null}
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.75}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.brand} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Clock Card ── */}
        <View style={styles.clockCard}>
          <LiveClock />

          {isOffline && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>⚡ Offline · Showing cached data</Text>
            </View>
          )}

          {/* Status chip */}
          <View style={[styles.statusChip,
            isCurrentlyIn ? styles.statusChipIn : styles.statusChipOut]}>
            <View style={[styles.statusDot, {
              backgroundColor: isCurrentlyIn ? C.in
                : checkins.length > 0 ? '#6B7280' : C.warn,
            }]} />
            <Text style={styles.statusChipText}>
              {isCurrentlyIn
                ? 'Currently Checked In'
                : checkins.length > 0
                  ? 'Checked Out'
                  : 'Not Checked In Today'}
            </Text>
          </View>
        </View>

        {/* ── Error ── */}
        {error ? (
          <TouchableOpacity style={styles.errorBox} onPress={() => loadData()}>
            <Text style={styles.errorText}>{error}  •  Tap to retry</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Punch Button ── */}
        <View style={styles.punchSection}>
          {lastMsg ? (
            <Text style={[styles.lastMsg, { color: isPunchIn ? C.out : C.in }]}>
              ✓ {lastMsg}
            </Text>
          ) : null}

          <PunchButton isPunchIn={isPunchIn} onPress={handleOpenModal} disabled={punching} />

          <Text style={styles.punchHint}>
            {isPunchIn ? 'Tap to record your Check-In' : 'Tap to record your Check-Out'}
          </Text>
        </View>

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: C.in }]}>{formatTime(firstIn?.time)}</Text>
            <Text style={styles.statLbl}>Check In</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: C.primary }]}>{formatHours(hoursWorked)}</Text>
            <Text style={styles.statLbl}>Hours Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: C.out }]}>{formatTime(lastOut?.time)}</Text>
            <Text style={styles.statLbl}>Check Out</Text>
          </View>
        </View>

        {/* ── Today's Log ── */}
        <View style={styles.logCard}>
          <View style={styles.logCardHeader}>
            <Text style={styles.logCardTitle}>Today's Punches</Text>
            <View style={styles.logCount}>
              <Text style={styles.logCountText}>{checkins.length}</Text>
            </View>
          </View>

          {checkins.length === 0 ? (
            <View style={styles.emptyLog}>
              <Text style={styles.emptyLogIcon}>🕐</Text>
              <Text style={styles.emptyLogText}>No punches recorded yet today</Text>
            </View>
          ) : (
            <View>
              {[...checkins].reverse().map((log, idx) => (
                <View key={log.name} style={[
                  styles.logRow,
                  idx < checkins.length - 1 && styles.logRowBorder,
                ]}>
                  <View style={[styles.logDot, {
                    backgroundColor: log.log_type === 'IN' ? C.in : C.out,
                  }]} />
                  <View style={styles.logRowInfo}>
                    <Text style={styles.logRowTime}>{formatTime(log.time)}</Text>
                    {log.shift ? <Text style={styles.logRowShift}>{log.shift}</Text> : null}
                  </View>
                  <View style={[
                    styles.logTypeBadge,
                    log.log_type === 'IN' ? styles.logBadgeIn : styles.logBadgeOut,
                  ]}>
                    <Text style={[styles.logTypeTxt, {
                      color: log.log_type === 'IN' ? C.in : C.out,
                    }]}>
                      {log.log_type === 'IN' ? 'CHECK IN' : 'CHECK OUT'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Employee Footer ── */}
        <View style={styles.empFooter}>
          <Text style={styles.empFooterLabel}>Employee ID</Text>
          <Text style={styles.empFooterVal}>{employee?.name}</Text>
          {employee?.department
            ? <Text style={styles.empFooterDept}>{employee.department}</Text>
            : null}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  loadingText: { marginTop: 12, fontSize: 15, color: C.textMuted },
  scrollContent: { paddingBottom: 16 },

  // ── Header ──
  topBar: {
    backgroundColor: C.primary,
    paddingTop: 48, paddingBottom: 18, paddingHorizontal: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
  },
  avatarText:   { fontSize: 18, fontWeight: '700', color: '#fff' },
  greetingText: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  nameText:     { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 1 },
  designText:   { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  logoutBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 50,
  },
  logoutText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // ── Clock Card ──
  clockCard: {
    backgroundColor: C.primary,
    paddingBottom: 24, paddingTop: 0,
    alignItems: 'center',
  },
  offlineBadge: {
    backgroundColor: 'rgba(245,158,11,0.22)',
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20, marginTop: 8, marginBottom: 4,
  },
  offlineBadgeText: { fontSize: 11, color: '#FDE68A', fontWeight: '600' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 50,
  },
  statusChipIn:  { backgroundColor: 'rgba(60,200,143,0.2)' },
  statusChipOut: { backgroundColor: 'rgba(255,255,255,0.12)' },
  statusDot:     { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  statusChipText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // ── Error ──
  errorBox: {
    backgroundColor: C.errorLight, marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, padding: 12,
    borderLeftWidth: 3, borderLeftColor: C.out,
  },
  errorText: { color: '#991B1B', fontSize: 12, fontWeight: '500' },

  // ── Punch Section ──
  punchSection: {
    alignItems: 'center', paddingVertical: 28,
    backgroundColor: C.card,
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 20,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  lastMsg:   { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  punchHint: { marginTop: 18, fontSize: 13, color: C.textMuted, fontWeight: '500' },

  // Punch button
  punchWrapper: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center' },
  pulseRing: {
    position: 'absolute', width: 196, height: 196,
    borderRadius: 98, borderWidth: 3,
  },
  middleRing: {
    position: 'absolute', width: 172, height: 172,
    borderRadius: 86, borderWidth: 2, borderStyle: 'dashed', opacity: 0.4,
  },
  punchCircle: {
    width: 148, height: 148, borderRadius: 74,
    justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  punchLabel: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 1.5 },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row', backgroundColor: C.card,
    marginHorizontal: 16, marginTop: 14,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    shadowRadius: 4, elevation: 2,
  },
  statBox:    { flex: 1, alignItems: 'center' },
  statVal:    { fontSize: 17, fontWeight: '800' },
  statLbl:    { fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },

  // ── Log Card ──
  logCard: {
    backgroundColor: C.card, marginHorizontal: 16, marginTop: 14,
    borderRadius: 16, padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    shadowRadius: 4, elevation: 2,
  },
  logCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  logCardTitle: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  logCount: {
    backgroundColor: C.brand, width: 24, height: 24,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  logCountText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  emptyLog:     { paddingVertical: 24, alignItems: 'center' },
  emptyLogIcon: { fontSize: 28, marginBottom: 8 },
  emptyLogText: { fontSize: 13, color: C.textMuted },
  logRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  logRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  logDot:       { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  logRowInfo:   { flex: 1 },
  logRowTime:   { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  logRowShift:  { fontSize: 11, color: C.textMuted, marginTop: 1 },
  logTypeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  logBadgeIn:   { backgroundColor: C.inLight },
  logBadgeOut:  { backgroundColor: C.outLight },
  logTypeTxt:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // ── Employee Footer ──
  empFooter: {
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04,
    shadowRadius: 3, elevation: 1,
  },
  empFooterLabel: { fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  empFooterVal:   { fontSize: 15, fontWeight: '700', color: C.textSecond },
  empFooterDept:  { fontSize: 11, color: C.textMuted, marginTop: 2 },
});

export default HomeScreen;
