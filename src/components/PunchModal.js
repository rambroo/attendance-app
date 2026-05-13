import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Alert, Image,
  StatusBar, Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { C } from '../utils/theme';

const MAX_LOCATION_RETRIES = 3;

// ── Location status machine ───────────────────────────────────────────────────
// 'fetching' → 'ok' | 'error' | 'denied'

const PunchModal = ({ visible, logType, onConfirm, onCancel, punching }) => {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [phase,                setPhase]                = useState('camera');   // 'camera' | 'preview'
  const [photo,                setPhoto]                = useState(null);
  const [location,             setLocation]             = useState(null);
  const [locationStatus,       setLocationStatus]       = useState('fetching');
  const [locationRetries,      setLocationRetries]      = useState(0);
  const [forceWithoutLocation, setForceWithoutLocation] = useState(false);
  const cameraRef = useRef(null);

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
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 12000,
      });
      const { latitude, longitude } = coords;
      let address = '';
      try {
        const places = await Location.reverseGeocodeAsync({ latitude, longitude });
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

  // Reset on every open
  useEffect(() => {
    if (visible) {
      setPhase('camera');
      setPhoto(null);
      setLocation(null);
      setLocationStatus('fetching');
      setLocationRetries(0);
      setForceWithoutLocation(false);
      doFetchLocation();
    }
  }, [visible, doFetchLocation]);

  // ── Camera actions ──────────────────────────────────────────────────────────

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.5, base64: true, skipProcessing: false,
      });
      setPhoto({ uri: result.uri, base64: result.base64 });
      setPhase('preview');
    } catch {
      Alert.alert('Camera Error', 'Could not capture photo. Please try again.');
    }
  };

  // No skip-selfie path — the server script requires custom_selfie_image on Before Save.

  const handleRetake = useCallback(() => {
    setPhoto(null);
    setPhase('camera');
  }, []);

  const handleConfirm = useCallback(
    () => onConfirm({ photo, location }),
    [onConfirm, photo, location]
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
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ══ Camera Phase ══════════════════════════════════════════════════════ */}
      {phase === 'camera' && (
        <View style={S.cameraContainer}>
          {cameraPermission?.granted ? (
            <View style={{ flex: 1 }}>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />

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
                <Text style={S.faceGuideHint}>Align your face in the oval</Text>
              </View>

              {/* Bottom bar */}
              <View style={S.camBottomBar}>
                <LocationIndicator
                  status={locationStatus}
                  location={location}
                  compact
                />
                <TouchableOpacity
                  style={[S.shutter, { borderColor: accent }]}
                  onPress={handleCapture}
                  activeOpacity={0.8}
                >
                  <View style={[S.shutterInner, { backgroundColor: accent }]} />
                </TouchableOpacity>
                <View style={{ width: 80 }} />
              </View>
            </View>
          ) : (
            <View style={S.camLoading}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={S.camLoadingText}>Starting camera…</Text>
            </View>
          )}
        </View>
      )}

      {/* ══ Preview Phase ═════════════════════════════════════════════════════ */}
      {phase === 'preview' && (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
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

            {(locationStatus === 'error' || locationStatus === 'denied') && (
              <View style={S.locErrorCard}>
                {/* Header */}
                <View style={S.locErrorHeader}>
                  <Text style={S.locErrorIcon}>⚠️</Text>
                  <Text style={S.locErrorTitle}>
                    {locationStatus === 'denied'
                      ? 'Location access denied'
                      : 'Could not obtain GPS location'}
                  </Text>
                </View>

                {/* Body */}
                <Text style={S.locErrorBody}>
                  {locationStatus === 'denied'
                    ? 'Your organization requires GPS location for every check-in. Please enable location access in device settings.'
                    : `GPS fix failed after ${locationRetries} attempt${locationRetries !== 1 ? 's' : ''}. Your server will reject a punch without coordinates.`}
                </Text>

                {/* Action buttons */}
                {locationStatus === 'denied' ? (
                  <TouchableOpacity style={S.locActionBtn} onPress={() => Linking.openSettings()}>
                    <Text style={S.locActionText}>Open Device Settings →</Text>
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
                  <ActivityIndicator color="#fff" size="small" />
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
        </View>
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
        {status === 'denied' ? 'Location denied' : 'Location unavailable'}
      </Text>
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // ── Camera permission denied ──
  permContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#0a0a0a', padding: 32,
  },
  permClose: {
    position: 'absolute', top: 52, right: 24,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  permCloseText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  permIcon:          { fontSize: 56, marginBottom: 16 },
  permTitle:         { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 10 },
  permBody:          { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  permPrimaryBtn: {
    borderRadius: 50, paddingVertical: 14, paddingHorizontal: 24,
    marginBottom: 12, width: '100%', alignItems: 'center',
  },
  permPrimaryText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  permSecondaryBtn: {
    borderWidth: 1, borderColor: '#444', borderRadius: 50,
    paddingVertical: 12, paddingHorizontal: 24,
    width: '100%', alignItems: 'center',
  },
  permSecondaryText: { color: '#ccc', fontSize: 14, fontWeight: '600' },

  // ── Camera phase ──
  cameraContainer:  { flex: 1, backgroundColor: '#000' },
  camLoading:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  camLoadingText:   { color: '#fff', marginTop: 12, fontSize: 15 },

  camTopBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  camCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  camCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  faceGuideWrap:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  faceOval: {
    width: 220, height: 280, borderRadius: 110,
    borderWidth: 2.5, borderStyle: 'dashed',
  },
  faceGuideHint: {
    color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 16, textAlign: 'center',
  },

  camBottomBar: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingBottom: 48, paddingTop: 16, paddingHorizontal: 20, alignItems: 'center',
  },
  camLocRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 20, paddingHorizontal: 12, maxWidth: '80%',
  },
  camLocDot:   { fontSize: 14, marginRight: 6 },
  camLocMuted: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  camLocOk:    { color: 'rgba(255,255,255,0.8)', fontSize: 12, flex: 1 },
  camLocWarn:  { color: C.warn, fontSize: 12 },

  shutter: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 4, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28 },

  punchBadge:     { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 50 },
  punchBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },

  // ── Preview phase ──
  previewImage: { width: '100%', height: '55%', resizeMode: 'cover' },

  previewPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#111',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },

  previewTime: {
    textAlign: 'center', fontSize: 26, fontWeight: '800',
    color: '#fff', marginBottom: 14,
  },

  // ── Location rows in preview ──
  locRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  locRowOk: { backgroundColor: 'rgba(60,200,143,0.1)' },
  locIcon:         { fontSize: 16, marginRight: 8 },
  locFetchingText: { color: '#9CA3AF', fontSize: 13 },
  locOkText:       { flex: 1, color: '#D1D5DB', fontSize: 13, lineHeight: 20 },

  // ── Location error card ──
  locErrorCard: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: C.warn,
  },
  locErrorHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  locErrorIcon:    { fontSize: 16, marginRight: 8 },
  locErrorTitle:   { fontSize: 14, fontWeight: '700', color: '#FDE68A', flex: 1 },
  locErrorBody:    { fontSize: 12, color: '#9CA3AF', lineHeight: 18, marginBottom: 12 },
  locActionBtn: {
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
    borderRadius: 50, paddingVertical: 8, paddingHorizontal: 16,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  locActionText:     { color: C.warn, fontSize: 12, fontWeight: '700' },
  locExhaustedText:  { fontSize: 11, color: '#6B7280', marginBottom: 12 },

  // ── Force without location toggle ──
  forceRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#4B5563',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10, marginTop: 1,
  },
  checkboxOn:  { backgroundColor: C.warn, borderColor: C.warn },
  checkmark:   { color: '#fff', fontSize: 12, fontWeight: '800' },
  forceLabel:  { fontSize: 13, color: '#D1D5DB', fontWeight: '600' },
  forceSub:    { fontSize: 11, color: '#6B7280', marginTop: 2 },

  // ── Preview action buttons ──
  previewBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  retakeBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#374151',
    borderRadius: 50, paddingVertical: 14, alignItems: 'center',
  },
  retakeBtnText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    flex: 2, borderRadius: 50, paddingVertical: 14, alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3,
    shadowRadius: 8, elevation: 6,
  },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled:    { opacity: 0.45, elevation: 0, shadowOpacity: 0 },
});

export default memo(PunchModal);
