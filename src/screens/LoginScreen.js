import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Modal,
} from 'react-native';
import { encode as base64Encode } from 'base-64';
import { loginWithPassword } from '../api/authApi';
import { getSiteUrl, saveKioskConfig, kioskPinProblem, validateAndConnect } from '../utils/siteConfig';
import { C, themed } from '../utils/theme';
import { getBuildTag } from '../utils/buildInfo';

// Site address, email and password on one page. Each error is shown under the
// field it belongs to: a bad or unreachable address under the address, a
// rejected email/password under the password, anything else at the bottom.
//
// onUseSite(url) is called with a validated address before signing in. App.js
// saves it, and clears the previous site's data if the address changed.
const LoginScreen = ({ onLoginSuccess, onUseSite, onKioskMode }) => {
  const [siteUrl, setSiteUrl]       = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [urlError, setUrlError]     = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError]           = useState('');

  // Kiosk mode setup modal
  const [kioskModal,   setKioskModal]   = useState(false);
  const [kioskKey,     setKioskKey]     = useState('');
  const [kioskLoc,     setKioskLoc]     = useState('Main Entrance');
  const [kioskPin,     setKioskPin]     = useState('');
  const [kioskLoading, setKioskLoading] = useState(false);
  const [kioskError,   setKioskError]   = useState('');

  // Returning users only have to type their password.
  useEffect(() => {
    getSiteUrl().then((u) => { if (u) setSiteUrl(u.replace(/^https:\/\//, '')); });
  }, []);

  const clearErrors = () => { setUrlError(''); setEmailError(''); setPasswordError(''); setError(''); };

  // Validate the address and hand it to App.js. Shows the error under the
  // address field and returns false if the site can't be used.
  const connectSite = async () => {
    if (!siteUrl.trim()) { setUrlError("Enter your organisation's site address."); return false; }
    try {
      const validated = await validateAndConnect(siteUrl);
      await onUseSite(validated);
      return true;
    } catch (err) {
      setUrlError(err.message || 'Could not connect to that site.');
      return false;
    }
  };

  const openKioskSetup = async () => {
    clearErrors();
    setLoading(true);
    const ok = await connectSite();
    setLoading(false);
    if (ok) { setKioskError(''); setKioskModal(true); }
  };

  const handleKioskSetup = async () => {
    setKioskError('');
    if (!kioskKey.trim()) { setKioskError('Please enter the Kiosk API Key.'); return; }
    if (!kioskKey.includes(':')) { setKioskError('Format must be  apiKey:apiSecret'); return; }
    const pinProblem = kioskPinProblem(kioskPin.trim());
    if (pinProblem) { setKioskError(pinProblem); return; }
    setKioskLoading(true);
    try {
      await saveKioskConfig({ apiKey: base64Encode(kioskKey.trim()), location: kioskLoc.trim(), pin: kioskPin.trim() });
      setKioskModal(false);
      onKioskMode();
    } catch (err) {
      setKioskError(err.message || 'Could not save kiosk configuration.');
    } finally {
      setKioskLoading(false);
    }
  };

  const handleLogin = async () => {
    clearErrors();
    let missing = false;
    if (!siteUrl.trim())  { setUrlError("Enter your organisation's site address."); missing = true; }
    if (!email.trim())    { setEmailError('Enter your work email.'); missing = true; }
    if (!password.trim()) { setPasswordError('Enter your password.'); missing = true; }
    if (missing) return;

    setLoading(true);
    try {
      if (!(await connectSite())) return;
      const result = await loginWithPassword(email.trim(), password);
      onLoginSuccess(result);
    } catch (err) {
      if (err.authFailed) setPasswordError('Email or password is incorrect.');
      else setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand Header ── */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>⏱</Text>
          </View>
          <Text style={styles.appName}>Attendance</Text>
          <Text style={styles.appSubtitle}>TechNiti · Punch In & Out</Text>
        </View>

        {/* ── Login Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardSubtitle}>Use your ERPNext credentials</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Site address</Text>
            <TextInput
              style={[styles.input, urlError ? styles.inputError : null]}
              placeholder="yourcompany.erpnext.com"
              value={siteUrl}
              onChangeText={(t) => { setSiteUrl(t); setUrlError(''); }}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
            />
            {urlError
              ? <Text style={styles.fieldError}>{urlError}</Text>
              : <Text style={styles.fieldHint}>The address you use to open ERPNext in a browser. Ask HR if you're not sure.</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Work Email</Text>
            <TextInput
              style={[styles.input, emailError ? styles.inputError : null]}
              placeholder="you@company.com"
              value={email}
              onChangeText={(t) => { setEmail(t); setEmailError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
            />
            {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.passwordRow, passwordError ? styles.inputError : null]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                value={password}
                onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={C.onBrand} size="small" />
              : <Text style={styles.loginBtnText}>Sign In →</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Contact HR if you cannot access your account.
        </Text>

        <TouchableOpacity style={styles.kioskLink} onPress={openKioskSetup} disabled={loading} activeOpacity={0.7}>
          <Text style={styles.kioskLinkText}>🏫  Switch to Kiosk Mode</Text>
        </TouchableOpacity>

        {/* Which code this phone is running — see utils/buildInfo.js */}
        <Text style={styles.buildTag}>{getBuildTag()}</Text>
      </ScrollView>

      {/* ── Kiosk Setup Modal ── */}
      <Modal visible={kioskModal} animationType="slide" transparent onRequestClose={() => setKioskModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Kiosk Mode Setup</Text>
              <Text style={styles.modalSub}>
                Fixed device at entrance — persons enter their ID to check in/out.{'\n'}
                Create a Frappe API Key for the kiosk user and paste it below.
              </Text>

              <Text style={styles.label}>Kiosk API Key *</Text>
              <TextInput
                style={[styles.input, kioskError && styles.inputError]}
                placeholder="apiKey:apiSecret"
                value={kioskKey}
                onChangeText={(t) => { setKioskKey(t); setKioskError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={C.textMuted}
              />

              <Text style={styles.label}>Location / Kiosk Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Main Entrance, Gate 1"
                value={kioskLoc}
                onChangeText={setKioskLoc}
                placeholderTextColor={C.textMuted}
              />

              <Text style={styles.label}>Admin Exit PIN (4 digits)</Text>
              <TextInput
                style={styles.input}
                placeholder="Choose 4 digits"
                value={kioskPin}
                onChangeText={setKioskPin}
                keyboardType="numeric"
                maxLength={4}
                placeholderTextColor={C.textMuted}
              />

              {kioskError ? (
                <View style={styles.errorBox}><Text style={styles.errorText}>⚠ {kioskError}</Text></View>
              ) : null}

              <TouchableOpacity
                style={[styles.kioskBtn, kioskLoading && styles.loginBtnDisabled]}
                onPress={handleKioskSetup}
                disabled={kioskLoading}
                activeOpacity={0.85}
              >
                {kioskLoading
                  ? <ActivityIndicator color={C.onBrand} size="small" />
                  : <Text style={styles.loginBtnText}>Start Kiosk →</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setKioskModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow: 1, paddingHorizontal: 24,
    paddingTop: 64, paddingBottom: 40,
  },

  header:      { alignItems: 'center', marginBottom: 28 },
  logoBox: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  logoIcon:    { fontSize: 36 },
  appName:     { fontSize: 30, fontWeight: '800', color: C.primary, letterSpacing: 0.3 },
  appSubtitle: { fontSize: 14, color: C.textMuted, marginTop: 4 },

  sitePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 50,
    paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'center', marginBottom: 20,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    maxWidth: '90%',
  },
  siteDot:   { fontSize: 8, color: C.brand, marginRight: 6 },
  siteLabel: { fontSize: 13, color: C.textSecond, fontWeight: '500', flex: 1 },
  changeText: { fontSize: 12, color: C.brand, fontWeight: '700', marginLeft: 10 },

  card: {
    backgroundColor: C.card, borderRadius: 20, padding: 24,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: 20,
  },
  cardTitle:    { fontSize: 22, fontWeight: '800', color: C.textPrimary, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 24 },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: C.textSecond, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: C.textPrimary, backgroundColor: C.bg,
  },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    backgroundColor: C.bg,
  },
  passwordInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: C.textPrimary,
  },
  eyeBtn:  { paddingHorizontal: 14 },
  eyeIcon: { fontSize: 18 },

  errorBox: {
    backgroundColor: C.errorLight, borderRadius: 10, padding: 12,
    marginBottom: 14, borderLeftWidth: 3, borderLeftColor: C.out,
  },
  errorText: { color: C.errorText, fontSize: 13, fontWeight: '500' },

  loginBtn: {
    backgroundColor: C.brand, borderRadius: 50,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
    shadowColor: C.brandDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  loginBtnDisabled: { backgroundColor: C.textMuted, shadowOpacity: 0, elevation: 0 },
  loginBtnText: { color: C.onBrand, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  hint: { textAlign: 'center', fontSize: 12, color: C.textMuted, lineHeight: 18 },

  kioskLink: { alignSelf: 'center', marginTop: 20, paddingVertical: 10, paddingHorizontal: 20 },
  fieldError: { color: C.errorText, fontSize: 12, fontWeight: '500', marginTop: 6 },
  fieldHint:  { color: C.textMuted, fontSize: 11, marginTop: 6, lineHeight: 16 },
  kioskLinkText: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  buildTag: { alignSelf: 'center', marginTop: 12, fontSize: 11, color: C.textMuted, opacity: 0.8 },

  // Kiosk setup modal
  modalOverlay: { flex: 1, backgroundColor: C.scrimLight, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginBottom: 6 },
  modalSub:   { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 19 },

  inputError: { borderColor: C.error },
  kioskBtn: {
    backgroundColor: C.warn, borderRadius: 50,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
    shadowColor: C.warnText, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  cancelBtn:  { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 14, color: C.textSecond, fontWeight: '600' },
}));

export default LoginScreen;
