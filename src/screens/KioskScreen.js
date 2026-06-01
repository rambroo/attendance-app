import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Modal, Image, Alert,
  Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { C } from '../utils/theme';
import { kioskPunch, uploadKioskSelfie } from '../api/kioskApi';
import { getKioskConfig, clearKioskMode, clearSiteConfig } from '../utils/siteConfig';

const { width: SW } = Dimensions.get('window');

// ── Live Clock ────────────────────────────────────────────────────────────────

const LiveClock = memo(() => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh   = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View style={clk.wrap}>
      <Text style={clk.time}>{hh}</Text>
      <Text style={clk.date}>{date}</Text>
    </View>
  );
});

const clk = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 20 },
  time: { fontSize: 56, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  date: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
});

// ── Camera Selfie Modal ───────────────────────────────────────────────────────

const CameraModal = memo(({ visible, onCapture, onSkip }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [countdown, setCountdown]       = useState(3);
  const [capturing, setCapturing]       = useState(false);
  const cameraRef = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => {
    if (visible) {
      setCountdown(3);
      setCapturing(false);
      // Start countdown when modal opens
      let count = 3;
      timerRef.current = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count === 0) {
          clearInterval(timerRef.current);
          handleSnap();
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible]);

  const handleSnap = useCallback(async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false });
      onCapture(photo);
    } catch {
      onSkip();
    }
  }, [capturing, onCapture, onSkip]);

  if (!visible) return null;

  if (!permission?.granted) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={cam.overlay}>
          <View style={cam.permCard}>
            <Text style={cam.permIcon}>📷</Text>
            <Text style={cam.permTitle}>Camera Access Needed</Text>
            <Text style={cam.permSub}>Allow camera to capture your photo for attendance verification.</Text>
            <TouchableOpacity style={cam.permBtn} onPress={requestPermission}>
              <Text style={cam.permBtnText}>Allow Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cam.skipBtn} onPress={onSkip}>
              <Text style={cam.skipText}>Skip Photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={cam.overlay}>
        <View style={cam.container}>
          <Text style={cam.heading}>Look at the camera</Text>

          <View style={cam.cameraWrap}>
            <CameraView
              ref={cameraRef}
              style={cam.camera}
              facing="front"
            />
            {/* Oval face guide */}
            <View style={cam.oval} />
            {/* Countdown badge */}
            <View style={cam.countBadge}>
              <Text style={cam.countText}>{capturing ? '📸' : countdown}</Text>
            </View>
          </View>

          <Text style={cam.hint}>
            {capturing ? 'Capturing…' : `Auto-capture in ${countdown}s`}
          </Text>

          <View style={cam.btnRow}>
            <TouchableOpacity style={cam.captureBtn} onPress={handleSnap} disabled={capturing}>
              <Text style={cam.captureBtnText}>Capture Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cam.skipBtnInline} onPress={onSkip}>
              <Text style={cam.skipInlineText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const cam = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  container:     { width: '100%', maxWidth: 360, alignItems: 'center' },
  heading:       { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 20 },
  cameraWrap:    { width: SW * 0.72, height: SW * 0.72, borderRadius: SW * 0.36, overflow: 'hidden', position: 'relative', borderWidth: 3, borderColor: C.brand },
  camera:        { width: '100%', height: '100%' },
  oval:          { position: 'absolute', top: '10%', left: '15%', width: '70%', height: '80%', borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', borderStyle: 'dashed' },
  countBadge:    { position: 'absolute', bottom: 12, right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center' },
  countText:     { fontSize: 20, fontWeight: '800', color: '#fff' },
  hint:          { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 14, marginBottom: 20 },
  btnRow:        { flexDirection: 'row', gap: 12, width: '100%' },
  captureBtn:    { flex: 1, backgroundColor: C.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  captureBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skipBtnInline: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  skipInlineText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },

  permCard:    { backgroundColor: '#1a1a1a', borderRadius: 24, padding: 28, alignItems: 'center', width: SW - 60 },
  permIcon:    { fontSize: 48, marginBottom: 12 },
  permTitle:   { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8 },
  permSub:     { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  permBtn:     { backgroundColor: C.brand, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28, marginBottom: 10, width: '100%', alignItems: 'center' },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skipBtn:     { paddingVertical: 10 },
  skipText:    { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});

// ── Success / Error Overlay ───────────────────────────────────────────────────

const ResultOverlay = memo(({ state, data }) => {
  const scale   = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const active = state === 'success_in' || state === 'success_out' || state === 'error';
    if (active) {
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.88);
      opacity.setValue(0);
    }
  }, [state]);

  if (state === 'idle' || state === 'loading' || state === 'camera') return null;

  const isOut   = state === 'success_out';
  const isError = state === 'error';
  const accent  = isError ? C.error : (isOut ? C.warn : C.brand);
  const icon    = isError ? '✕' : (isOut ? '👋' : '✓');
  const title   = isError
    ? (data?.message || 'ID not recognised')
    : (isOut
        ? `See you, ${data?.person_name?.split(' ')[0]}!`
        : `Welcome, ${data?.person_name?.split(' ')[0]}!`);
  const sub = isError
    ? 'Please check your ID and try again.'
    : `${data?.person_type || ''} · ${isOut ? 'Checked OUT' : 'Checked IN'} at ${data?.time || ''}`;

  // Photo to show: selfie if captured, else profile image
  const photoUri = data?.selfie_url || data?.image_url;

  return (
    <Animated.View style={[ov.wrap, { opacity, transform: [{ scale }] }]}>
      <View style={[ov.card, { borderColor: accent + '55' }]}>
        {/* Photo */}
        {!isError && photoUri ? (
          <Image source={{ uri: photoUri }} style={[ov.photo, { borderColor: accent }]} />
        ) : (
          <View style={[ov.iconCircle, { backgroundColor: accent + '18', borderColor: accent }]}>
            <Text style={[ov.icon, { color: accent }]}>{icon}</Text>
          </View>
        )}

        <Text style={[ov.title, { color: isError ? C.error : '#fff' }]}>{title}</Text>
        <Text style={ov.sub}>{sub}</Text>

        <View style={[ov.bar, { backgroundColor: accent }]} />
      </View>
    </Animated.View>
  );
});

const ov = StyleSheet.create({
  wrap:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 100, paddingHorizontal: 24, backgroundColor: 'rgba(13,31,23,0.97)' },
  card:       { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 28, borderWidth: 1, padding: 32, alignItems: 'center', overflow: 'hidden' },
  photo:      { width: 120, height: 120, borderRadius: 60, marginBottom: 20, borderWidth: 3 },
  iconCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  icon:       { fontSize: 40, fontWeight: '800' },
  title:      { fontSize: 30, fontWeight: '800', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5, color: '#fff' },
  sub:        { fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 },
  bar:        { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4 },
});

// ── Admin PIN Modal ───────────────────────────────────────────────────────────

const AdminModal = memo(({ visible, onClose, onExit }) => {
  const [pin,   setPin]   = useState('');
  const [error, setError] = useState('');

  const verify = useCallback(async () => {
    const { pin: stored } = await getKioskConfig();
    if (pin === stored) {
      Alert.alert('Exit Kiosk Mode', 'Choose an option:', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch to Employee Mode', onPress: () => onExit('keepSite') },
        { text: 'Change Site', style: 'destructive', onPress: () => onExit('changeSite') },
      ]);
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  }, [pin, onExit]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={pm.card}>
            <Text style={pm.title}>Admin Access</Text>
            <Text style={pm.sub}>Enter PIN to exit kiosk mode</Text>
            <TextInput
              style={pm.input}
              value={pin}
              onChangeText={t => { setPin(t); setError(''); }}
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              placeholder="• • • •"
              placeholderTextColor={C.textMuted}
              autoFocus
            />
            {error ? <Text style={pm.error}>{error}</Text> : null}
            <TouchableOpacity style={pm.btn} onPress={verify}>
              <Text style={pm.btnText}>Verify</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pm.cancel} onPress={() => { setPin(''); setError(''); onClose(); }}>
              <Text style={pm.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
});

const pm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  card:       { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: SW - 64, alignItems: 'center' },
  title:      { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginBottom: 6 },
  sub:        { fontSize: 14, color: C.textMuted, marginBottom: 24, textAlign: 'center' },
  input:      { borderWidth: 2, borderColor: C.border, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, fontSize: 24, color: C.textPrimary, letterSpacing: 10, textAlign: 'center', width: '100%', marginBottom: 8, backgroundColor: C.bg },
  error:      { fontSize: 13, color: C.error, marginBottom: 10 },
  btn:        { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', width: '100%', marginTop: 10 },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel:     { marginTop: 12, paddingVertical: 8 },
  cancelText: { color: C.textMuted, fontSize: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function KioskScreen({ onExitKiosk }) {
  const [idInput,    setIdInput]    = useState('');
  const [state,      setState]      = useState('idle'); // idle|camera|loading|success_in|success_out|error
  const [resultData, setResultData] = useState(null);
  const [lastPunch,  setLastPunch]  = useState(null);
  const [location,   setLocation]   = useState('');
  const [showAdmin,  setShowAdmin]  = useState(false);
  const [pendingId,  setPendingId]  = useState('');
  const inputRef   = useRef(null);
  const resetTimer = useRef(null);

  useEffect(() => {
    getKioskConfig().then(({ location: loc }) => setLocation(loc));
    const t = setTimeout(() => inputRef.current?.focus(), 500);
    return () => clearTimeout(t);
  }, []);

  const resetToIdle = useCallback((delay = 3500) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setState('idle');
      setResultData(null);
      setIdInput('');
      setPendingId('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }, delay);
  }, []);

  // Step 1: ID entered → open camera
  const handleIdSubmit = useCallback(() => {
    const id = idInput.trim();
    if (!id || state !== 'idle') return;
    setPendingId(id);
    setState('camera');
  }, [idInput, state]);

  // Step 2a: Photo captured → upload + punch
  const handleCapture = useCallback(async (photo) => {
    setState('loading');
    try {
      let selfieUrl = '';
      try {
        selfieUrl = await uploadKioskSelfie(photo);
      } catch {
        // selfie upload failure is non-fatal — continue without photo
      }
      const result = await kioskPunch(pendingId, selfieUrl);
      const isOut  = result.log_type === 'OUT';
      // Attach the captured selfie to result for display
      if (selfieUrl) result.selfie_url = selfieUrl;
      setState(isOut ? 'success_out' : 'success_in');
      setResultData(result);
      setLastPunch({ name: result.person_name, log: result.log_type, time: result.time });
      resetToIdle(4000);
    } catch (err) {
      setState('error');
      setResultData({ message: err.message || 'ID not recognised. Please try again.' });
      resetToIdle(2500);
    }
  }, [pendingId, resetToIdle]);

  // Step 2b: Skipped photo → punch without selfie
  const handleSkipCamera = useCallback(async () => {
    setState('loading');
    try {
      const result = await kioskPunch(pendingId, '');
      const isOut  = result.log_type === 'OUT';
      setState(isOut ? 'success_out' : 'success_in');
      setResultData(result);
      setLastPunch({ name: result.person_name, log: result.log_type, time: result.time });
      resetToIdle(3500);
    } catch (err) {
      setState('error');
      setResultData({ message: err.message || 'ID not recognised. Please try again.' });
      resetToIdle(2500);
    }
  }, [pendingId, resetToIdle]);

  const handleAdminExit = useCallback(async (action) => {
    setShowAdmin(false);
    if (action === 'changeSite') {
      await clearSiteConfig();
      onExitKiosk('changeSite');
    } else {
      await clearKioskMode();
      onExitKiosk('keepSite');
    }
  }, [onExitKiosk]);

  return (
    <View style={s.root}>
      {/* Header */}
      <SafeAreaView style={s.header}>
        <View style={s.locationPill}>
          <View style={s.dot} />
          <Text style={s.locationText}>{location}</Text>
        </View>
        <TouchableOpacity style={s.gearBtn} onPress={() => setShowAdmin(true)}>
          <Text style={s.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Clock */}
      <LiveClock />

      {/* Divider */}
      <View style={s.divider} />

      {/* Input card */}
      <View style={s.card}>
        <Text style={s.cardLabel}>ENTER YOUR ID TO CHECK IN / OUT</Text>

        {state === 'loading' ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={C.brand} size="large" />
            <Text style={s.loadingText}>Processing…</Text>
          </View>
        ) : (
          <>
            <TextInput
              ref={inputRef}
              style={s.input}
              value={idInput}
              onChangeText={setIdInput}
              placeholder="Roll No / ID"
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoCorrect={false}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleIdSubmit}
              editable={state === 'idle'}
              selectionColor={C.brand}
            />
            <TouchableOpacity
              style={[s.punchBtn, !idInput.trim() && s.punchBtnOff]}
              onPress={handleIdSubmit}
              disabled={!idInput.trim() || state !== 'idle'}
              activeOpacity={0.85}
            >
              <Text style={s.punchBtnText}>CHECK IN / OUT  →</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Last punch */}
      {lastPunch && (
        <View style={s.lastRow}>
          <View style={[s.lastDot, { backgroundColor: lastPunch.log === 'OUT' ? C.warn : C.brand }]} />
          <Text style={s.lastText}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{lastPunch.name}</Text>
            {'  '}
            <Text style={{ color: lastPunch.log === 'OUT' ? C.warn : C.brand }}>{lastPunch.log}</Text>
            {'  ·  '}{lastPunch.time}
          </Text>
        </View>
      )}

      {/* Camera modal */}
      <CameraModal
        visible={state === 'camera'}
        onCapture={handleCapture}
        onSkip={handleSkipCamera}
      />

      {/* Result overlay */}
      <ResultOverlay state={state} data={resultData} />

      {/* Admin modal */}
      <AdminModal
        visible={showAdmin}
        onClose={() => setShowAdmin(false)}
        onExit={handleAdminExit}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0D1F17' },

  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  locationPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  dot:          { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.brand, marginRight: 7 },
  locationText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  gearBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  gearIcon:     { fontSize: 18, color: 'rgba(255,255,255,0.6)' },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 24, marginBottom: 28 },

  card:       { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cardLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 18, fontWeight: '600', letterSpacing: 1 },
  input:      { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, fontSize: 24, color: '#fff', textAlign: 'center', letterSpacing: 3, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  punchBtn:   { backgroundColor: C.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: C.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },
  punchBtnOff: { backgroundColor: 'rgba(255,255,255,0.07)', shadowOpacity: 0, elevation: 0 },
  punchBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1 },

  loadingWrap: { alignItems: 'center', paddingVertical: 24 },
  loadingText: { color: 'rgba(255,255,255,0.45)', fontSize: 14, marginTop: 12 },

  lastRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'absolute', bottom: 36, left: 0, right: 0 },
  lastDot:  { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  lastText: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
});
