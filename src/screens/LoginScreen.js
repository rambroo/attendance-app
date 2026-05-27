import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { loginWithPassword } from '../api/authApi';
import { getSiteLabel } from '../utils/siteConfig';
import { C } from '../utils/theme';

const LoginScreen = ({ onLoginSuccess, onChangeSite }) => {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [siteLabel, setSiteLabel]   = useState('');

  useEffect(() => {
    getSiteLabel().then((l) => setSiteLabel(l || ''));
  }, []);

  const handleLogin = async () => {
    setError('');
    if (!email.trim())    { setError('Please enter your email.');    return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }
    setLoading(true);
    try {
      const result = await loginWithPassword(email.trim(), password);
      onLoginSuccess(result);
    } catch (err) {
      setError(err.message || 'Login failed.');
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

        {/* ── Site pill ── */}
        {siteLabel ? (
          <View style={styles.sitePill}>
            <Text style={styles.siteDot}>●</Text>
            <Text style={styles.siteLabel} numberOfLines={1}>{siteLabel}</Text>
            <TouchableOpacity onPress={onChangeSite} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Login Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardSubtitle}>Use your ERPNext credentials</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Work Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
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
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.loginBtnText}>Sign In →</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Contact HR if you cannot access your account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
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
  errorText: { color: '#991B1B', fontSize: 13, fontWeight: '500' },

  loginBtn: {
    backgroundColor: C.brand, borderRadius: 50,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
    shadowColor: C.brandDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  loginBtnDisabled: { backgroundColor: C.textMuted, shadowOpacity: 0, elevation: 0 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  hint: { textAlign: 'center', fontSize: 12, color: C.textMuted, lineHeight: 18 },
});

export default LoginScreen;
