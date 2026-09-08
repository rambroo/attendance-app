import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal, Image,
  ActivityIndicator, RefreshControl,
  TouchableOpacity, StatusBar, Dimensions, Linking,
} from 'react-native';
import { C, themed } from '../utils/theme';
import {
  getMonthAttendance, getMonthCheckins, getDateCheckins,
  getCachedEmployee, getSelfieUrls, formatHours, formatTime, calcWorkingHours,
} from '../api/attendanceApi';

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_HEADERS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEKDAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const STATUS_TILE = {
  Present:    { bg: C.in, text: C.onBrand },
  Absent:     { bg: C.out, text: C.onBrand },
  'Half Day': { bg: C.warn, text: C.onBrand },
  'On Leave': { bg: C.leave, text: C.onBrand },
  Holiday:    { bg: C.holiday, text: C.onBrand },
};

const toDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const NOW   = new Date();
const TODAY = toDateKey(NOW);

// ── Day Detail Modal ──────────────────────────────────────────────────────────

const DayDetailModal = memo(({ visible, date, attendance, onClose }) => {
  const [checkins,     setCheckins]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [selfieUri,    setSelfieUri]    = useState(null);
  const [selfieError,  setSelfieError]  = useState(false);

  useEffect(() => {
    if (!visible || !date) return;
    setCheckins([]);
    setSelfieUri(null);
    setSelfieError(false);
    setLoading(true);

    const load = async () => {
      try {
        const emp = await getCachedEmployee();
        if (!emp) return;
        const data = await getDateCheckins(emp.name, toDateKey(date));
        setCheckins(data);

        // Passing the whole record (not just the name) lets getSelfieUrls fall
        // back to the stored public path on sites without next_attendance.
        const selfieRecord = data.find(c => c.custom_selfie_image);
        if (selfieRecord) {
          const urls = await getSelfieUrls([selfieRecord]);
          const uri = urls[selfieRecord.name];
          if (uri) setSelfieUri(uri);
          else setSelfieError(true);
        }
      } catch (e) {
        console.warn('Day detail fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [visible, date]);

  if (!date) return null;

  const dateKey    = toDateKey(date);
  const dayName    = WEEKDAY_FULL[date.getDay()];
  const dayNum     = date.getDate();
  const monthName  = MONTH_NAMES[date.getMonth()];
  const year       = date.getFullYear();

  const attTile     = attendance ? (STATUS_TILE[attendance.status] || null) : null;
  const hasCheckin  = checkins.length > 0;
  const workedHours = hasCheckin ? calcWorkingHours(checkins) : 0;
  const geoRecord   = checkins.find(c => c.custom_geofence_status);

  // First checkin with GPS coordinates (for map button)
  const locRecord   = checkins.find(c => c.latitude && c.longitude);

  const openMap = () => {
    if (!locRecord) return;
    const { latitude, longitude } = locRecord;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={M.backdrop} activeOpacity={1} onPress={onClose} />

      <View style={M.panel}>
        {/* Handle */}
        <View style={M.handle} />

        {/* Header */}
        <View style={M.header}>
          <View>
            <Text style={M.dayName}>{dayName}</Text>
            <Text style={M.dateText}>{dayNum} {monthName} {year}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={M.closeBtn} activeOpacity={0.7}>
            <Text style={M.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={M.scrollContent}>
          {loading ? (
            <View style={M.loadingBox}>
              <ActivityIndicator color={C.brand} size="large" />
              <Text style={M.loadingText}>Loading details…</Text>
            </View>
          ) : (
            <>
              {/* Status badge */}
              <View style={M.statusRow}>
                {attTile ? (
                  <View style={[M.badge, { backgroundColor: attTile.bg }]}>
                    <Text style={[M.badgeText, { color: attTile.text }]}>{attendance.status}</Text>
                  </View>
                ) : hasCheckin ? (
                  <View style={[M.badge, { backgroundColor: C.inLight }]}>
                    <Text style={[M.badgeText, { color: C.inText }]}>Checked In</Text>
                  </View>
                ) : (
                  <View style={[M.badge, { backgroundColor: C.divider }]}>
                    <Text style={[M.badgeText, { color: C.neutral }]}>No Record</Text>
                  </View>
                )}
              </View>

              {/* Selfie */}
              {selfieUri && !selfieError ? (
                <View style={M.selfieWrap}>
                  <Text style={M.sectionTitle}>Selfie</Text>
                  <Image
                    source={{ uri: selfieUri }}
                    style={M.selfie}
                    resizeMode="cover"
                    onError={() => setSelfieError(true)}
                  />
                </View>
              ) : selfieError ? (
                <View style={M.noSelfieBox}>
                  <Text style={M.noSelfieText}>📷 Selfie unavailable (older private file)</Text>
                </View>
              ) : hasCheckin ? (
                <View style={M.noSelfieBox}>
                  <Text style={M.noSelfieText}>📷 No selfie for this day</Text>
                </View>
              ) : null}

              {/* Punch timeline */}
              {hasCheckin && (
                <View style={M.section}>
                  <Text style={M.sectionTitle}>Punch Timeline</Text>
                  {checkins.map((c, i) => (
                    <View key={c.name} style={M.punchRow}>
                      <View style={[M.punchDot, { backgroundColor: c.log_type === 'IN' ? C.in : C.out }]} />
                      <View style={M.punchLine}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={M.punchType}>{c.log_type === 'IN' ? 'Punch In' : 'Punch Out'}</Text>
                          <Text style={[M.punchTime, { color: c.log_type === 'IN' ? C.in : C.out }]}>
                            {formatTime(c.time)}
                          </Text>
                        </View>
                        {c.custom_notes ? (
                          <Text style={M.punchNote}>📝 {c.custom_notes}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Working hours */}
              {workedHours > 0 && (
                <View style={M.statsRow}>
                  <View style={M.statBox}>
                    <Text style={M.statIcon}>⏱</Text>
                    <Text style={M.statVal}>{formatHours(workedHours)}</Text>
                    <Text style={M.statLbl}>Worked</Text>
                  </View>
                  {attendance?.working_hours > 0 && (
                    <View style={M.statBox}>
                      <Text style={M.statIcon}>✅</Text>
                      <Text style={M.statVal}>{formatHours(attendance.working_hours)}</Text>
                      <Text style={M.statLbl}>Approved</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Location + Map */}
              {(geoRecord || locRecord) && (
                <View style={M.section}>
                  <Text style={M.sectionTitle}>Location</Text>

                  {geoRecord && (
                    <View style={[
                      M.geoBox,
                      { backgroundColor: geoRecord.custom_geofence_status === 'Within Range' ? C.inLight : C.outLight },
                    ]}>
                      <Text style={[
                        M.geoStatus,
                        { color: geoRecord.custom_geofence_status === 'Within Range' ? C.inText : C.errorText },
                      ]}>
                        {geoRecord.custom_geofence_status === 'Within Range' ? '📍 ' : '⚠️ '}
                        {geoRecord.custom_geofence_status}
                      </Text>
                      {geoRecord.custom_matched_location ? (
                        <Text style={M.geoLocation}>{geoRecord.custom_matched_location}</Text>
                      ) : null}
                      {geoRecord.custom_distance_meters > 0 ? (
                        <Text style={M.geoDist}>{geoRecord.custom_distance_meters} m from office</Text>
                      ) : null}
                    </View>
                  )}

                  {locRecord && (
                    <TouchableOpacity style={M.mapBtn} onPress={openMap} activeOpacity={0.8}>
                      <Text style={M.mapBtnIcon}>🗺</Text>
                      <View>
                        <Text style={M.mapBtnLabel}>Open in Google Maps</Text>
                        <Text style={M.mapCoords}>
                          {Number(locRecord.latitude).toFixed(5)}, {Number(locRecord.longitude).toFixed(5)}
                        </Text>
                      </View>
                      <Text style={M.mapArrow}>›</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Flags */}
              {(attendance?.late_entry || attendance?.early_exit) && (
                <View style={M.flagsRow}>
                  {attendance.late_entry && (
                    <View style={M.flagBox}>
                      <Text style={M.flagText}>⚠ Late Entry</Text>
                    </View>
                  )}
                  {attendance.early_exit && (
                    <View style={M.flagBox}>
                      <Text style={M.flagText}>⚠ Early Exit</Text>
                    </View>
                  )}
                </View>
              )}

              {!hasCheckin && !attendance && (
                <View style={M.emptyDay}>
                  <Text style={M.emptyIcon}>🗓</Text>
                  <Text style={M.emptyText}>No activity on this day</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
});

// ── Calendar tile ─────────────────────────────────────────────────────────────

const CalendarCell = memo(({ date, attendance, checkins, isToday, onPress }) => {
  if (!date) return <View style={S.cellFlex} />;

  const isFuture   = toDateKey(date) > TODAY;
  const hasCheckin = checkins && checkins.length > 0;

  let bg, fg, dotColor = null;

  if (isFuture) {
    // Future dates — dimmed, no status
    bg = C.tileIdle; fg = C.tileIdleText;
  } else if (attendance && STATUS_TILE[attendance.status]) {
    // Official attendance record
    const t = STATUS_TILE[attendance.status];
    bg = t.bg; fg = t.text;
    if (attendance.late_entry) dotColor = C.warn;
  } else if (hasCheckin) {
    // Punched but no official record yet
    bg = C.inLight; fg = C.inText;
    dotColor = C.in;
  } else {
    // No record and not future → treat as Absent
    bg = C.outLight; fg = C.out;
  }

  const isTappable = !isFuture && (attendance || hasCheckin);

  return (
    <TouchableOpacity
      style={S.cellFlex}
      onPress={isTappable ? () => onPress(date, attendance) : undefined}
      activeOpacity={isTappable ? 0.75 : 1}
      disabled={!isTappable}
    >
      <View style={[S.tile, { backgroundColor: bg }, isToday && S.tileToday]}>
        <Text style={[S.tileNum, { color: fg }]}>
          {String(date.getDate()).padStart(2, '0')}
        </Text>
        {dotColor ? <View style={[S.dot, { backgroundColor: dotColor }]} /> : null}
      </View>
    </TouchableOpacity>
  );
});

// ── Screen ────────────────────────────────────────────────────────────────────

const HistoryScreen = ({ onLogout, onSessionExpired }) => {
  const [selYear,    setSelYear]    = useState(NOW.getFullYear());
  const [selMonth,   setSelMonth]   = useState(NOW.getMonth() + 1);
  const [attendance, setAttendance] = useState([]);
  const [checkinMap, setCheckinMap] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  const [isOffline,  setIsOffline]  = useState(false);

  // Day detail modal state
  const [modalDate,  setModalDate]  = useState(null);
  const [modalAtt,   setModalAtt]   = useState(null);
  const [modalOpen,  setModalOpen]  = useState(false);

  const handleSessionExpired = useCallback(() => {
    if (onSessionExpired) onSessionExpired();
  }, [onSessionExpired]);

  const loadData = useCallback(async (year, month, showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const emp = await getCachedEmployee();
      if (!emp) throw new Error('Employee not found.');
      const [attData, ckinMap] = await Promise.all([
        getMonthAttendance(emp.name, year, month),
        getMonthCheckins(emp.name, year, month),
      ]);
      setAttendance(attData);
      setCheckinMap(ckinMap);
      setIsOffline(false);
    } catch (err) {
      if (err.sessionExpired) { handleSessionExpired(); return; }
      setIsOffline(true);
      setError(err.message || 'Failed to load attendance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    loadData(selYear, selMonth, true);
  }, [selYear, selMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Month navigation ────────────────────────────────────────────────────────

  const isCurrentMonth = selYear === NOW.getFullYear() && selMonth === NOW.getMonth() + 1;

  const goPrev = useCallback(() => {
    setAttendance([]); setCheckinMap({});
    if (selMonth === 1) { setSelYear(y => y - 1); setSelMonth(12); }
    else                { setSelMonth(m => m - 1); }
  }, [selMonth]);

  const goNext = useCallback(() => {
    if (isCurrentMonth) return;
    setAttendance([]); setCheckinMap({});
    if (selMonth === 12) { setSelYear(y => y + 1); setSelMonth(1); }
    else                 { setSelMonth(m => m + 1); }
  }, [selMonth, isCurrentMonth]);

  // ── Day tap ─────────────────────────────────────────────────────────────────

  const handleDayPress = useCallback((date, att) => {
    setModalDate(date);
    setModalAtt(att || null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const attendanceMap = useMemo(() => {
    const m = {};
    attendance.forEach(r => { m[r.attendance_date] = r; });
    return m;
  }, [attendance]);

  const rows = useMemo(() => {
    const startDow  = new Date(selYear, selMonth - 1, 1).getDay();
    const totalDays = new Date(selYear, selMonth, 0).getDate();
    const flat      = [];

    for (let i = 0; i < startDow; i++)
      flat.push({ key: `pre-${i}`, date: null });

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(selYear, selMonth - 1, d);
      const key  = toDateKey(date);
      flat.push({ key, date, att: attendanceMap[key] || null, ckin: checkinMap[key] || null });
    }

    const tail = (7 - (flat.length % 7)) % 7;
    for (let i = 0; i < tail; i++)
      flat.push({ key: `post-${i}`, date: null });

    const r = [];
    for (let i = 0; i < flat.length; i += 7) r.push(flat.slice(i, i + 7));
    return r;
  }, [selYear, selMonth, attendanceMap, checkinMap]);

  // Summary is derived from the same data the calendar shows — not just
  // official Attendance records (which may not exist yet if Auto Attendance
  // hasn't run). Logic mirrors the calendar tile colours exactly:
  //   Official Attendance record  → use its status
  //   Checkin exists, no Attendance → count as Present
  //   No record, past day         → count as Absent
  //   Today / future              → skip
  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, halfDay: 0, onLeave: 0, totalHours: 0 };
    const totalDays = new Date(selYear, selMonth, 0).getDate();

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(selYear, selMonth - 1, d);
      const key  = toDateKey(date);
      if (key > TODAY) continue; // skip future

      const att  = attendanceMap[key];
      const ckin = checkinMap[key]; // array | undefined

      if (att) {
        if      (att.status === 'Present')  s.present++;
        else if (att.status === 'Absent')   s.absent++;
        else if (att.status === 'Half Day') s.halfDay++;
        else if (att.status === 'On Leave') s.onLeave++;
        s.totalHours += parseFloat(att.working_hours || 0);
      } else if (ckin && ckin.length > 0) {
        s.present++;
        s.totalHours += calcWorkingHours(ckin);
      } else {
        s.absent++;
      }
    }
    return s;
  }, [attendanceMap, checkinMap, selYear, selMonth]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(selYear, selMonth, false);
  }, [loadData, selYear, selMonth]);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={S.centered}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={S.loadingText}>Loading…</Text>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={S.container}>
      <StatusBar barStyle={C.statusBar} backgroundColor={C.primary} />

      <DayDetailModal
        visible={modalOpen}
        date={modalDate}
        attendance={modalAtt}
        onClose={closeModal}
      />

      <View style={S.header}>
        <Text style={S.headerTitle}>History</Text>
        {isOffline && (
          <View style={S.offlinePill}><Text style={S.offlineText}>⚡ Offline</Text></View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.brand} />
        }
      >
        {/* Month navigator */}
        <View style={S.monthNav}>
          <TouchableOpacity onPress={goPrev} style={S.navBtn} activeOpacity={0.7}>
            <Text style={S.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={S.monthLabel}>{MONTH_NAMES[selMonth - 1]} {selYear}</Text>
          <TouchableOpacity
            onPress={goNext}
            style={[S.navBtn, isCurrentMonth && S.navDisabled]}
            disabled={isCurrentMonth}
            activeOpacity={0.7}
          >
            <Text style={[S.navArrow, isCurrentMonth && S.navArrowDim]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Summary bar */}
        <View style={S.summaryBar}>
          {[
            { label: 'Present',  value: summary.present,  color: C.in, bg: C.inLight },
            { label: 'Absent',   value: summary.absent,   color: C.out, bg: C.outLight },
            { label: 'Half Day', value: summary.halfDay,  color: C.warn, bg: C.warnLight },
            { label: 'On Leave', value: summary.onLeave,  color: C.leave, bg: C.leaveLight },
          ].map(({ label, value, color, bg }) => (
            <View key={label} style={[S.summaryItem, { backgroundColor: bg, borderTopColor: color }]}>
              <Text style={[S.summaryVal, { color }]}>{value}</Text>
              <Text style={S.summaryLbl}>{label}</Text>
            </View>
          ))}
        </View>

        {summary.totalHours > 0 && (
          <View style={S.hoursRow}>
            <Text style={S.hoursLbl}>Total hours this month</Text>
            <Text style={S.hoursVal}>{formatHours(summary.totalHours)}</Text>
          </View>
        )}

        {error ? (
          <TouchableOpacity style={S.errorBox} onPress={() => loadData(selYear, selMonth)}>
            <Text style={S.errorText}>{error}  ·  Tap to retry</Text>
          </TouchableOpacity>
        ) : null}

        {/* Calendar */}
        <View style={S.calendarWrap}>
          <View style={S.dayHeaders}>
            {DAY_HEADERS.map((d) => (
              <Text key={d} style={S.dayHeader}>{d}</Text>
            ))}
          </View>
          <View style={S.grid}>
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={S.calRow}>
                {row.map(({ key, date, att, ckin }) => (
                  <CalendarCell
                    key={key}
                    date={date}
                    attendance={att}
                    checkins={ckin}
                    isToday={date ? toDateKey(date) === TODAY : false}
                    onPress={handleDayPress}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>

        {/* Tap hint */}
        <Text style={S.tapHint}>Tap a coloured day to see details & selfie</Text>

        {/* Legend */}
        <View style={S.legend}>
          {[
            { color: C.in, label: 'Present' },
            { color: C.out, label: 'Absent' },
            { color: C.warn, label: 'Half Day' },
            { color: C.leave, label: 'On Leave' },
            { color: C.inLight, label: 'Checked In' },
            { color: C.tileIdle, label: 'Upcoming' },
          ].map(({ color, label }) => (
            <View key={label} style={S.legendItem}>
              <View style={[S.legendDot, { backgroundColor: color }]} />
              <Text style={S.legendText}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
};

// ── Calendar styles ───────────────────────────────────────────────────────────

const S = themed(() => StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  loadingText: { marginTop: 12, color: C.textMuted, fontSize: 15 },

  header: {
    backgroundColor: C.primary,
    paddingTop: 50, paddingBottom: 14, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.heroText },
  offlinePill: {
    backgroundColor: C.heroWarnChip,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50,
  },
  offlineText: { fontSize: 11, color: C.heroWarnText, fontWeight: '600' },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14,
    backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  navBtn:      { paddingHorizontal: 14, paddingVertical: 4 },
  navDisabled: { opacity: 0.3 },
  navArrow:    { fontSize: 32, color: C.primary, fontWeight: '300', lineHeight: 36 },
  navArrowDim: { color: C.textMuted },
  monthLabel:  { fontSize: 18, fontWeight: '800', color: C.textPrimary },

  summaryBar:  { flexDirection: 'row', marginHorizontal: 16, marginTop: 14, gap: 8 },
  summaryItem: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', borderTopWidth: 3 },
  summaryVal:  { fontSize: 20, fontWeight: '800' },
  summaryLbl:  {
    fontSize: 9, color: C.textMuted, marginTop: 2,
    textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center',
  },

  hoursRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.primary, marginHorizontal: 16, marginTop: 10,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
  },
  hoursLbl: { fontSize: 13, color: C.heroTextMuted, fontWeight: '500' },
  hoursVal: { fontSize: 16, fontWeight: '800', color: C.heroText },

  errorBox: {
    backgroundColor: C.errorLight, marginHorizontal: 16, marginTop: 10,
    borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: C.out,
  },
  errorText: { color: C.errorText, fontSize: 12, fontWeight: '500' },

  calendarWrap: {
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: C.card, borderRadius: 16, overflow: 'hidden',
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07,
    shadowRadius: 6, elevation: 3,
  },
  dayHeaders: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 8 },
  dayHeader:  {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '700', color: C.heroTextMuted,
    textTransform: 'uppercase',
  },
  sunHeader: { color: C.heroDanger },
  grid:      { paddingVertical: 4 },
  calRow:    { flexDirection: 'row' },

  cellFlex:  { flex: 1, aspectRatio: 1, padding: 3 },
  tile: {
    flex: 1, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  tileToday: {
    borderWidth: 2.5, borderColor: C.brand,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  tileNum:  { fontSize: 14, fontWeight: '800' },
  dot:      { position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 3 },

  tapHint: {
    textAlign: 'center', fontSize: 11, color: C.textMuted,
    marginTop: 10, fontStyle: 'italic',
  },

  legend:     { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, marginTop: 10, gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot:  { width: 11, height: 11, borderRadius: 5, marginRight: 5, borderWidth: 1, borderColor: C.border },
  legendText: { fontSize: 11, color: C.textMuted },
}));

// ── Modal styles ──────────────────────────────────────────────────────────────

const M = themed(() => StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.scrimLight,
  },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 30,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  dayName:   { fontSize: 13, color: C.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  dateText:  { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginTop: 2 },
  closeBtn:  {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.divider,
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { fontSize: 16, color: C.textMuted, fontWeight: '700' },

  scrollContent: { paddingHorizontal: 20, paddingTop: 14 },

  loadingBox:  { alignItems: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: C.textMuted, fontSize: 14 },

  statusRow: { marginBottom: 16 },
  badge:     { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 50 },
  badgeText: { fontSize: 13, fontWeight: '700' },

  selfieWrap: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  selfie: {
    width: '100%', height: 220,
    borderRadius: 14, backgroundColor: C.divider,
  },
  noSelfieBox: {
    backgroundColor: C.cardAlt, borderRadius: 12, padding: 20,
    alignItems: 'center', marginBottom: 16,
  },
  noSelfieText: { color: C.textMuted, fontSize: 13 },

  section:    { marginBottom: 16 },
  punchRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  punchDot:   { width: 12, height: 12, borderRadius: 6, marginRight: 14, marginTop: 4 },
  punchLine:  { flex: 1 },
  punchType:  { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  punchTime:  { fontSize: 14, fontWeight: '700' },
  punchNote:  { fontSize: 12, color: C.textMuted, marginTop: 4, fontStyle: 'italic' },

  statsRow:   { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1, backgroundColor: C.bg, borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statVal:  { fontSize: 18, fontWeight: '800', color: C.textPrimary },
  statLbl:  { fontSize: 10, color: C.textMuted, marginTop: 2, textTransform: 'uppercase' },

  geoBox:      { borderRadius: 12, padding: 14, marginBottom: 10 },
  geoStatus:   { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  geoLocation: { fontSize: 13, color: C.textSecond, marginBottom: 2 },
  geoDist:     { fontSize: 12, color: C.textMuted },

  mapBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.infoLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.infoBorder,
  },
  mapBtnIcon:  { fontSize: 22, marginRight: 12 },
  mapBtnLabel: { fontSize: 14, fontWeight: '700', color: C.infoText },
  mapCoords:   { fontSize: 11, color: C.info, marginTop: 2 },
  mapArrow:    { marginLeft: 'auto', fontSize: 22, color: C.info, fontWeight: '300' },

  flagsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  flagBox:  {
    backgroundColor: C.warnLight, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  flagText: { fontSize: 12, color: C.warnText, fontWeight: '600' },

  emptyDay:  { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 14, color: C.textMuted },
}));

export default HistoryScreen;
