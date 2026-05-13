import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { C } from '../utils/theme';
import { validateAndConnect, saveSiteConfig } from '../utils/siteConfig';

const SiteSetupScreen = ({ onSiteConfigured }) => {
  const [url, setUrl]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  const handleConnect = async () => {
    setError('');
    setSuccess('');
    if (!url.trim()) { setError('Please enter your site URL.'); return; }
    setLoading(true);
    try {
      const cleanUrl = await validateAndConnect(url);
      const label = cleanUrl.replace(/^https?:\/\//, '');
      await saveSiteConfig(cleanUrl, label);
      setSuccess(`Connected to ${label}`);
      setTimeout(() => onSiteConfigured(), 700);
    } catch (err) {
      setError(err.message || 'Could not connect to the site.');
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
        {/* ── Brand ── */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>⏱</Text>
          </View>
          <Text style={styles.appName}>Attendance App</Text>
          <Text style={styles.tagline}>Powered by Frappe / ERPNext</Text>
        </View>

        {/* ── Connect Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect Your Workspace</Text>
          <Text style={styles.cardSub}>
            Enter your Frappe or ERPNext site URL to get started.
          </Text>

          <Text style={styles.label}>Site URL</Text>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="https://yourcompany.erpnext.com"
            value={url}
            onChangeText={(t) => { setUrl(t); setError(''); setSuccess(''); }}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleConnect}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✓ {success}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnOff]}
            onPress={handleConnect}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.btnText}>Connect →</Text>}
          </TouchableOpacity>
        </View>

        {/* ── Help ── */}
        <Text style={styles.help}>
          This is the URL you use to open ERPNext in a browser.{'\n'}
          <Text style={{ color: C.brand }}>https://company.erpnext.com</Text>
          {'  or  '}
          <Text style={{ color: C.brand }}>http://192.168.1.10:8000</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow: 1, paddingHorizontal: 24,
    paddingTop: 80, paddingBottom: 48,
    justifyContent: 'center',
  },

  header:  { alignItems: 'center', marginBottom: 40 },
  logoBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  logoIcon: { fontSize: 38 },
  appName:  { fontSize: 26, fontWeight: '800', color: C.primary, letterSpacing: 0.3 },
  tagline:  { fontSize: 13, color: C.textMuted, marginTop: 4 },

  card: {
    backgroundColor: C.card, borderRadius: 20, padding: 24,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: 24,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginBottom: 6 },
  cardSub:   { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 20 },

  label: { fontSize: 13, fontWeight: '600', color: C.textSecond, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, color: C.textPrimary, backgroundColor: C.bg,
    marginBottom: 14,
  },
  inputError: { borderColor: C.out },

  errorBox: {
    backgroundColor: C.errorLight, borderRadius: 10, padding: 12,
    marginBottom: 14, borderLeftWidth: 3, borderLeftColor: C.out,
  },
  errorText: { color: '#991B1B', fontSize: 13, fontWeight: '500' },

  successBox: {
    backgroundColor: C.inLight, borderRadius: 10, padding: 12,
    marginBottom: 14, borderLeftWidth: 3, borderLeftColor: C.in,
  },
  successText: { color: C.primary, fontSize: 13, fontWeight: '600' },

  btn: {
    backgroundColor: C.brand, borderRadius: 50,
    paddingVertical: 15, alignItems: 'center',
    shadowColor: C.brandDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  btnOff:  { backgroundColor: C.textMuted, shadowOpacity: 0, elevation: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  help: {
    textAlign: 'center', fontSize: 12,
    color: C.textMuted, lineHeight: 22,
  },
});

export default SiteSetupScreen;
