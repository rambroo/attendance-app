import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Alert, Image,
  StatusBar, Linking, TextInput, KeyboardAvoidingView, Platform, AppState,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { C, themed } from '../utils/theme';
import { pickPictureSize, CAPTURE_QUALITY } from '../utils/camera';

const MAX_LOCATION_RETRIES = 3;
const LOCATION_TIMEOUT_MS  = 12000;
const GEOCODE_TIMEOUT_MS   = 5000;
// A capture that has not finished by now is not going to: the camera lost its
// session underneath us. Give up, restart it, and let the user tap again rather
// than leaving them on a frozen screen.
const CAPTURE_TIMEOUT_MS       = 10000;
// If the camera never reports ready (some devices drop the event after a
// rebuild), enable the shutter anyway rather than disabling it forever.
const CAMERA_READY_FALLBACK_MS = 4000;

// The capture size chosen on the first open, kept for the rest of the session.
// Passing it from the start means later opens never have to rebuild the camera.
let cachedPictureSize;

// getCurrentPositionAsync has no timeout option and can hang indefinitely on
// devices with a poor GPS fix — race it against a real timer.
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

// ── Location status machine ───────────────────────────────────────────────────
// 'fetching' → 'ok' | 'error' | 'denied' | 'off' (device location switched off)

const PunchModal = ({ visible, logType, onConfirm, onCancel, punching }) => {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [phase,                setPhase]                = useState('camera');   // 'camera' | 'preview'
  const [photo,                setPhoto]                = useState(null);
  const [notes,                setNotes]                = useState('');
  const [location,             setLocation]             = useState(null);
  const [locationStatus,       setLocationStatus]       = useState('fetching');
  const [locationRetries,      setLocationRetries]      = useState(0);
  const [forceWithoutLocation, setForceWithoutLocation] = useState(false);
  const [pictureSize,          setPictureSize]          = useState(cachedPictureSize);
  // The shutter only works once the camera has a live session. Tapping it
  // earlier — e.g. while the camera rebuilds itself for a new picture size —
  // is what produced a blank screen.
  const [cameraReady,          setCameraReady]          = useState(false);
  const [capturing,            setCapturing]            = useState(false);
  const [cameraKey,            setCameraKey]            = useState(0);   // bump to remount the camera
  const cameraRef    = useRef(null);
  const capturingRef = useRef(false);

  // Pick a modest capture resolution once the camera is up. Left undefined the
  // camera shoots at full sensor size, producing multi-megabyte selfies that
  // dominate punch time on a mobile uplink.
  //
  // Setting pictureSize makes expo-camera tear the camera down and bind a new
  // one, which fires onCameraReady again — so the shutter is only enabled on
  // that second event, when the rebuilt camera is actually live.
  const handleCameraReady = useCallback(async () => {
    if (pictureSize) {
      setCameraReady(true);
      return;
    }
    try {
      const chosen = pickPictureSize(await cameraRef.current?.getAvailablePictureSizesAsync());
      if (chosen) {
        cachedPictureSize = chosen;
        setPictureSize(chosen);
        return;   // wait for the rebuilt camera to report ready
      }
    } catch { /* keep the camera default rather than failing the punch */ }
    setCameraReady(true);
  }, [pictureSize]);

  const isPunchIn = logType === 'IN';
  const accent    = isPunchIn ? C.in : C.out;

  // ── Location fetch ──────────────────────────────────────────────────────────

  const doFetchLocation = useCallback(async () => {
    setLocationStatus('fetching');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        return;
      }

      // Device location switched off: say so instead of fetching. Left alone,
      // getCurrentPositionAsync opens Android's "turn on location" screen on
      // top of the live camera, which pauses the app mid-capture.
      if (!(await Location.hasServicesEnabledAsync())) {
        setLocation(null);
        setLocationStatus('off');
        return;
      }

      let coords = null;
      try {
        ({ coords } = await withTimeout(
          // mayShowUserSettingsDialog: false — never open a system settings
          // screen while the camera is running. See handleTurnOnLocation.
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            mayShowUserSettingsDialog: false,
          }),
          LOCATION_TIMEOUT_MS,
        ));
      } catch {
        // Fresh fix failed — fall back to a recent cached position (≤60s old)
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        if (!last) throw new Error('no location');
        ({ coords } = last);
      }

      const { latitude, longitude } = coords;
      let address = '';
      try {
        const places = await withTimeout(
          Location.reverseGeocodeAsync({ latitude, longitude }),
          GEOCODE_TIMEOUT_MS,
        );
        if (places.length > 0) {
          const p = places[0];
          address = [p.name, p.street, p.district, p.city].filter(Boolean).slice(0, 3).join(', ');
        }
      } catch { /* address stays empty */ }
      setLocation({ latitude, longitude, address });
      setLocationStatus('ok');
    } catch {
      setLocationStatus('error');
      setLocation(null);
    }
  }, []);

  const handleRetryLocation = useCallback(() => {
    setLocationRetries((n) => n + 1);
    setForceWithoutLocation(false);
    doFetchLocation();
  }, [doFetchLocation]);

  // Only reachable from a tap on the preview screen, where the camera has
  // already closed — so Android's location settings screen can't interrupt it.
  const handleTurnOnLocation = useCallback(async () => {
    try { await Location.enableNetworkProviderAsync(); } catch { /* user declined */ }
    doFetchLocation();
  }, [doFetchLocation]);

  // Reset on every open
  useEffect(() => {
    if (visible) {
      setPhase('camera');
      setPhoto(null);
      setNotes('');
      setLocation(null);
      setLocationStatus('fetching');
      setLocationRetries(0);
      setForceWithoutLocation(false);
      setCameraReady(false);
      setCapturing(false);
      capturingRef.current = false;
      doFetchLocation();
    }
  }, [visible, doFetchLocation]);

  // Mount a fresh camera. Used when the current one may have no live session:
  // a capture that never finished, or the app coming back from a system screen
  // (location settings, a permission prompt, the notification shade).
  const restartCamera = useCallback(() => {
    setCameraReady(false);
    setCameraKey((k) => k + 1);
  }, []);

  // A system screen over the app flips AppState to 'background' on Android and
  // back to 'active' when it closes. The camera can come back black from that,
  // so restart it — unless a capture is in flight.
  useEffect(() => {
    if (!visible || phase !== 'camera') return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !capturingRef.current) restartCamera();
    });
    return () => sub.remove();
  }, [visible, phase, restartCamera]);

  useEffect(() => {
    if (!visible || phase !== 'camera' || cameraReady) return undefined;
    const id = setTimeout(() => setCameraReady(true), CAMERA_READY_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [visible, phase, cameraReady, cameraKey]);

  // ── Camera actions ──────────────────────────────────────────────────────────

  const handleCapture = async () => {
    if (!cameraRef.current || !cameraReady || capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      // takePictureAsync can wait forever if the camera lost its session, so
      // it is raced against a timer like the GPS fetch above.
      const result = await withTimeout(
        cameraRef.current.takePictureAsync({
          quality: CAPTURE_QUALITY, base64: false, skipProcessing: false,
        }),
        CAPTURE_TIMEOUT_MS,
      );
      if (!result?.uri) throw new Error('no photo');
      setPhoto({ uri: result.uri });
      setPhase('preview');
    } catch {
      restartCamera();
      Alert.alert('Camera Error', 'The camera stopped responding and has been restarted. Please try again.');
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  };

  // No skip-selfie path — the server script requires custom_selfie_image on Before Save.

  const handleRetake = useCallback(() => {
    setPhoto(null);
    setCameraReady(false);   // a new camera mounts; wait for it to be live
    setPhase('camera');
  }, []);

  const handleConfirm = useCallback(
    () => onConfirm({ photo, location, notes: notes.trim() }),
    [onConfirm, photo, location, notes]
  );

  // ── Derived confirm state ───────────────────────────────────────────────────
  // photo is always required — server script rejects without custom_selfie_image
  const canConfirm    = !!photo && (locationStatus === 'ok' || forceWithoutLocation);
  const isWarnPunch   = forceWithoutLocation && locationStatus !== 'ok';
  const retriesLeft   = MAX_LOCATION_RETRIES - locationRetries;
  const retriesExhausted = locationRetries >= MAX_LOCATION_RETRIES;

  // ── Camera permission denied ────────────────────────────────────────────────

  if (visible && cameraPermission && !cameraPermission.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
        <View style={S.permContainer}>
          <TouchableOpacity style={S.permClose} onPress={onCancel}>
            <Text style={S.permCloseText}>✕</Text>
          </TouchableOpacity>

          <Text style={S.permIcon}>📷</Text>
          <Text style={S.permTitle}>Camera Access Required</Text>
          <Text style={S.permBody}>
            Your organization requires a selfie photo for every check-in. Camera access cannot be skipped.
          </Text>

          <TouchableOpacity
            style={[S.permPrimaryBtn, { backgroundColor: accent }]}
            onPress={requestCameraPermission}
          >
            <Text style={S.permPrimaryText}>Grant Camera Access</Text>
          </TouchableOpacity>

          <TouchableOpacity style={S.permSecondaryBtn} onPress={() => Linking.openSettings()}>
            <Text style={S.permSecondaryText}>Open Device Settings →</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // ── Main modal ──────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <StatusBar barStyle="light-content" backgroundColor={C.shell} />

      {/* ══ Camera Phase ══════════════════════════════════════════════════════ */}
      {phase === 'camera' && (
        <View style={S.cameraContainer}>
          {cameraPermission?.granted ? (
            <View style={{ flex: 1 }}>
              <CameraView
                key={cameraKey}
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
                pictureSize={pictureSize}
                onCameraReady={handleCameraReady}
              />

              {/* Top bar */}
              <View style={S.camTopBar}>
                <TouchableOpacity onPress={onCancel} style={S.camCloseBtn}>
                  <Text style={S.camCloseText}>✕</Text>
                </TouchableOpacity>
                <View style={[S.punchBadge, { backgroundColor: accent }]}>
                  <Text style={S.punchBadgeText}>PUNCH {logType}</Text>
                </View>
                <View style={{ width: 40 }} />
              </View>

              {/* Face guide */}
              <View style={S.faceGuideWrap} pointerEvents="none">
                <View style={[S.faceOval, { borderColor: accent }]} />
                <Text style={S.faceGuideHint}>
                  {cameraReady ? 'Align your face in the oval' : 'Starting camera…'}
                </Text>
              </View>

              {/* Bottom bar */}
              <View style={S.camBottomBar}>
                <LocationIndicator
                  status={locationStatus}
                  location={location}
                  compact
                />
                <TouchableOpacity
                  style={[S.shutter, { borderColor: accent }, (!cameraReady || capturing) && S.shutterBusy]}
                  onPress={handleCapture}
                  disabled={!cameraReady || capturing}
                  activeOpacity={0.8}
                >
                  {cameraReady && !capturing
                    ? <View style={[S.shutterInner, { backgroundColor: accent }]} />
                    : <ActivityIndicator color={C.shellText} />}
                </TouchableOpacity>
                <View style={{ width: 80 }} />
              </View>
            </View>
          ) : (
            <View style={S.camLoading}>
              <ActivityIndicator size="large" color={C.shellText} />
              <Text style={S.camLoadingText}>Starting camera…</Text>
            </View>
          )}
        </View>
      )}

      {/* ══ Preview Phase ═════════════════════════════════════════════════════ */}
      {phase === 'preview' && (
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: C.shell }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Image source={{ uri: photo.uri }} style={S.previewImage} />

          <View style={S.previewPanel}>
            {/* Punch type badge */}
            <View style={[S.punchBadge, { backgroundColor: accent, alignSelf: 'center', marginBottom: 10 }]}>
              <Text style={S.punchBadgeText}>PUNCH {logType}</Text>
            </View>

            {/* Timestamp */}
            <Text style={S.previewTime}>
              {new Date().toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
              })}
            </Text>

            {/* ── Location block ── */}
            {locationStatus === 'fetching' && (
              <View style={S.locRow}>
                <ActivityIndicator size="small" color={C.textMuted} style={{ marginRight: 8 }} />
                <Text style={S.locFetchingText}>Acquiring GPS…</Text>
              </View>
            )}

            {locationStatus === 'ok' && location && (
              <View style={[S.locRow, S.locRowOk]}>
                <Text style={S.locIcon}>📍</Text>
                <Text style={S.locOkText} numberOfLines={2}>
                  {location.address
                    || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}
                </Text>
              </View>
            )}

            {(locationStatus === 'error' || locationStatus === 'denied' || locationStatus === 'off') && (
              <View style={S.locErrorCard}>
                {/* Header */}
                <View style={S.locErrorHeader}>
                  <Text style={S.locErrorIcon}>⚠️</Text>
                  <Text style={S.locErrorTitle}>
                    {locationStatus === 'denied'
                      ? 'Location access denied'
                      : locationStatus === 'off'
                        ? 'Location is turned off'
                        : 'Could not obtain GPS location'}
                  </Text>
                </View>

                {/* Body */}
                <Text style={S.locErrorBody}>
                  {locationStatus === 'denied'
                    ? 'Your organization requires GPS location for every check-in. Please enable location access in device settings.'
                    : locationStatus === 'off'
                      ? 'Turn on location so this punch records where you are. Your organization may reject punches without it.'
                      : `GPS fix failed after ${locationRetries} attempt${locationRetries !== 1 ? 's' : ''}. Your server will reject a punch without coordinates.`}
                </Text>

                {/* Action buttons */}
                {locationStatus === 'denied' ? (
                  <TouchableOpacity style={S.locActionBtn} onPress={() => Linking.openSettings()}>
                    <Text style={S.locActionText}>Open Device Settings →</Text>
                  </TouchableOpacity>
                ) : locationStatus === 'off' ? (
                  <TouchableOpacity style={S.locActionBtn} onPress={handleTurnOnLocation}>
                    <Text style={S.locActionText}>Turn on location →</Text>
                  </TouchableOpacity>
                ) : !retriesExhausted ? (
                  <TouchableOpacity style={S.locActionBtn} onPress={handleRetryLocation}>
                    <Text style={S.locActionText}>
                      ↻ Retry GPS &nbsp;·&nbsp; {retriesLeft} attempt{retriesLeft !== 1 ? 's' : ''} left
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={S.locExhaustedText}>All retry attempts exhausted.</Text>
                )}

                {/* Force without location toggle */}
                <TouchableOpacity
                  style={S.forceRow}
                  onPress={() => setForceWithoutLocation((v) => !v)}
                  activeOpacity={0.75}
                >
                  <View style={[S.checkbox, forceWithoutLocation && S.checkboxOn]}>
                    {forceWithoutLocation && <Text style={S.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.forceLabel}>Punch without location</Text>
                    <Text style={S.forceSub}>Server may reject this check-in</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Additional notes (optional) ── */}
            <View style={S.notesBlock}>
              <Text style={S.notesLabel}>Additional Notes <Text style={S.notesOptional}>(optional)</Text></Text>
              <TextInput
                style={S.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder={logType === 'IN' ? 'e.g. Client visit, working from site…' : 'e.g. Left early - doctor appointment…'}
                placeholderTextColor={C.shellTextFaint}
                multiline
                numberOfLines={2}
                maxLength={250}
                editable={!punching}
              />
            </View>

            {/* ── Buttons ── */}
            <View style={S.previewBtns}>
              <TouchableOpacity style={S.retakeBtn} onPress={handleRetake} disabled={punching}>
                <Text style={S.retakeBtnText}>↩ Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  S.confirmBtn,
                  { backgroundColor: isWarnPunch ? C.warn : accent },
                  (!canConfirm || punching) && S.btnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!canConfirm || punching}
                activeOpacity={0.85}
              >
                {punching ? (
                  <ActivityIndicator color={C.onBrand} size="small" />
                ) : locationStatus === 'fetching' ? (
                  <Text style={S.confirmBtnText}>Waiting for GPS…</Text>
                ) : isWarnPunch ? (
                  <Text style={S.confirmBtnText}>⚠ Punch without location</Text>
                ) : (
                  <Text style={S.confirmBtnText}>✓ Confirm Punch {logType}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
};

// ── Compact location indicator used in camera bottom bar ─────────────────────
const LocationIndicator = memo(({ status, location, compact }) => {
  if (status === 'fetching') {
    return (
      <View style={S.camLocRow}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={{ marginRight: 6 }} />
        <Text style={S.camLocMuted}>Getting location…</Text>
      </View>
    );
  }
  if (status === 'ok' && location) {
    return (
      <View style={S.camLocRow}>
        <Text style={S.camLocDot}>📍</Text>
        <Text style={S.camLocOk} numberOfLines={1}>
          {location.address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
        </Text>
      </View>
    );
  }
  return (
    <View style={S.camLocRow}>
      <Text style={S.camLocDot}>⚠️</Text>
      <Text style={S.camLocWarn}>
        {status === 'denied' ? 'Location denied' : status === 'off' ? 'Location is off' : 'Location unavailable'}
      </Text>
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const S = themed(() => StyleSheet.create({
  // ── Camera permission denied ──
  permContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.shellDeep, padding: 32,
  },
  permClose: {
    position: 'absolute', top: 52, right: 24,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.shellInputEdge,
    justifyContent: 'center', alignItems: 'center',
  },
  permCloseText:     { color: C.shellText, fontSize: 16, fontWeight: '700' },
  permIcon:          { fontSize: 56, marginBottom: 16 },
  permTitle:         { fontSize: 20, fontWeight: '700', color: C.shellText, textAlign: 'center', marginBottom: 10 },
  permBody:          { fontSize: 14, color: C.shellTextMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  permPrimaryBtn: {
    borderRadius: 50, paddingVertical: 14, paddingHorizontal: 24,
    marginBottom: 12, width: '100%', alignItems: 'center',
  },
  permPrimaryText:   { color: C.onBrand, fontSize: 15, fontWeight: '700' },
  permSecondaryBtn: {
    borderWidth: 1, borderColor: C.shellBorder, borderRadius: 50,
    paddingVertical: 12, paddingHorizontal: 24,
    width: '100%', alignItems: 'center',
  },
  permSecondaryText: { color: C.shellTextMuted, fontSize: 14, fontWeight: '600' },

  // ── Camera phase ──
  cameraContainer:  { flex: 1, backgroundColor: C.shell },
  camLoading:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.shell },
  camLoadingText:   { color: C.shellText, marginTop: 12, fontSize: 15 },

  camTopBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: C.shellOverlay,
  },
  camCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.shellInputEdge,
    justifyContent: 'center', alignItems: 'center',
  },
  camCloseText: { color: C.shellText, fontSize: 18, fontWeight: '700' },

  faceGuideWrap:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  faceOval: {
    width: 220, height: 280, borderRadius: 110,
    borderWidth: 2.5, borderStyle: 'dashed',
  },
  faceGuideHint: {
    color: C.shellTextMuted, fontSize: 12, marginTop: 16, textAlign: 'center',
  },

  camBottomBar: {
    backgroundColor: C.shellOverlay,
    paddingBottom: 48, paddingTop: 16, paddingHorizontal: 20, alignItems: 'center',
  },
  camLocRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 20, paddingHorizontal: 12, maxWidth: '80%',
  },
  camLocDot:   { fontSize: 14, marginRight: 6 },
  camLocMuted: { color: C.shellTextMuted, fontSize: 12 },
  camLocOk:    { color: C.shellText, fontSize: 12, flex: 1 },
  camLocWarn:  { color: C.warn, fontSize: 12 },

  shutter: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 4, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.shellInputEdge,
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28 },
  shutterBusy:  { opacity: 0.6 },

  punchBadge:     { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 50 },
  punchBadgeText: { color: C.onBrand, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },

  // ── Preview phase ──
  previewImage: { width: '100%', height: '55%', resizeMode: 'cover' },

  previewPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.shellPanel,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },

  previewTime: {
    textAlign: 'center', fontSize: 26, fontWeight: '800',
    color: C.shellText, marginBottom: 14,
  },

  // ── Location rows in preview ──
  locRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.shellInput,
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  locRowOk: { backgroundColor: C.shellOkTint },
  locIcon:         { fontSize: 16, marginRight: 8 },
  locFetchingText: { color: C.shellTextMuted, fontSize: 13 },
  locOkText:       { flex: 1, color: C.shellText, fontSize: 13, lineHeight: 20 },

  // ── Location error card ──
  locErrorCard: {
    backgroundColor: C.shellWarnTint,
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: C.warn,
  },
  locErrorHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  locErrorIcon:    { fontSize: 16, marginRight: 8 },
  locErrorTitle:   { fontSize: 14, fontWeight: '700', color: C.heroWarnText, flex: 1 },
  locErrorBody:    { fontSize: 12, color: C.shellTextMuted, lineHeight: 18, marginBottom: 12 },
  locActionBtn: {
    borderWidth: 1, borderColor: C.shellWarnEdge,
    borderRadius: 50, paddingVertical: 8, paddingHorizontal: 16,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  locActionText:     { color: C.warn, fontSize: 12, fontWeight: '700' },
  locExhaustedText:  { fontSize: 11, color: C.shellTextFaint, marginBottom: 12 },

  // ── Force without location toggle ──
  forceRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: C.shellInputEdge,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: C.shellBorder,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10, marginTop: 1,
  },
  checkboxOn:  { backgroundColor: C.warn, borderColor: C.warn },
  checkmark:   { color: C.onBrand, fontSize: 12, fontWeight: '800' },
  forceLabel:  { fontSize: 13, color: C.shellText, fontWeight: '600' },
  forceSub:    { fontSize: 11, color: C.shellTextFaint, marginTop: 2 },

  // ── Notes block ──
  notesBlock:  { marginBottom: 16 },
  notesLabel:  { fontSize: 12, fontWeight: '700', color: C.shellText, marginBottom: 6 },
  notesOptional: { fontSize: 11, fontWeight: '500', color: C.shellTextFaint },
  notesInput: {
    backgroundColor: C.shellInput, borderRadius: 12,
    borderWidth: 1, borderColor: C.shellInputEdge,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: C.shellText, minHeight: 52,
    textAlignVertical: 'top',
  },

  // ── Preview action buttons ──
  previewBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  retakeBtn: {
    flex: 1, borderWidth: 1.5, borderColor: C.shellBorder,
    borderRadius: 50, paddingVertical: 14, alignItems: 'center',
  },
  retakeBtnText: { color: C.shellTextMuted, fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    flex: 2, borderRadius: 50, paddingVertical: 14, alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3,
    shadowRadius: 8, elevation: 6,
  },
  confirmBtnText: { color: C.onBrand, fontSize: 14, fontWeight: '700' },
  btnDisabled:    { opacity: 0.45, elevation: 0, shadowOpacity: 0 },
}));

export default memo(PunchModal);
