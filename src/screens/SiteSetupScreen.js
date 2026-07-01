import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { C } from '../utils/theme';
import { validateAndConnect, saveSiteConfig } from '../utils/siteConfig';

const SiteSetupScreen = ({ onSiteConfigured }) => {
  const [url,     setUrl]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleConnect = async () => {
    setError('');
    if (!url.trim()) { setError('Please enter your site URL.'); return; }
    setLoading(true);
    try {
      const validated = await validateAndConnect(url);
      const label = validated.replace(/^https?:\/\//, '');
      await saveSiteConfig(validated, label);
      onSiteConfigured({ mode: 'employee' });
    } catch (err) {
      setError(err.message || 'Could not connect to the site.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View style={s.logoBox}><Text style={s.logoIcon}>⏱</Text></View>
          <Text style={s.appName}>Next Attendance</Text>
          <Text style={s.tagline}>Powered by Frappe / ERPNext</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Connect Your Workspace</Text>
          <Text style={s.cardSub}>Enter your Frappe or ERPNext site URL to get started.</Text>

          <Text style={s.label}>Site URL</Text>
          <TextInput
            style={[s.input, error && s.inputError]}
            placeholder="https://yourcompany.erpnext.com"
            value={url}
            onChangeText={(t) => { setUrl(t); setError(''); }}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleConnect}
          />

          {error ? <View style={s.errorBox}><Text style={s.errorText}>⚠ {error}</Text></View> : null}

          <TouchableOpacity style={[s.btn, loading && s.btnOff]} onPress={handleConnect} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Connect →</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.help}>
          This is the URL you use to open ERPNext in a browser.{'\n'}
          <Text style={{ color: C.brand }}>https://company.erpnext.com</Text>
          {'  or  '}
          <Text style={{ color: C.brand }}>http://192.168.1.10:8000</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 70, paddingBottom: 48, justifyContent: 'center' },

  header:  { alignItems: 'center', marginBottom: 36 },
  logoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 },
  logoIcon: { fontSize: 38 },
  appName:  { fontSize: 26, fontWeight: '800', color: C.primary, letterSpacing: 0.3 },
  tagline:  { fontSize: 13, color: C.textMuted, marginTop: 4, textAlign: 'center' },

  card:      { backgroundColor: C.card, borderRadius: 20, padding: 24, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: 24 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginBottom: 6 },
  cardSub:   { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 20 },

  label:     { fontSize: 13, fontWeight: '600', color: C.textSecond, marginBottom: 6 },
  hint:      { fontSize: 11, color: C.textMuted, marginBottom: 14, marginTop: -10 },
  input:     { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.textPrimary, backgroundColor: C.bg, marginBottom: 14 },
  inputError: { borderColor: C.error },

  errorBox:  { backgroundColor: C.errorLight, borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: C.error },
  errorText: { color: '#991B1B', fontSize: 13, fontWeight: '500' },

  btn:     { backgroundColor: C.brand, borderRadius: 50, paddingVertical: 15, alignItems: 'center', shadowColor: C.brandDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  btnOff:  { backgroundColor: C.textMuted, shadowOpacity: 0, elevation: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

});

export default SiteSetupScreen;
