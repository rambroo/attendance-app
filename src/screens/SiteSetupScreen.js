import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { C } from '../utils/theme';
import { validateAndConnect, saveSiteConfig, saveKioskConfig } from '../utils/siteConfig';

// step: 'url' → 'mode' → 'kiosk_setup' (employee skips last step)
const SiteSetupScreen = ({ onSiteConfigured }) => {
  const [step,         setStep]         = useState('url');
  const [url,          setUrl]          = useState('');
  const [cleanUrl,     setCleanUrl]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  // Kiosk setup fields
  const [kioskKey,     setKioskKey]     = useState('');
  const [kioskLoc,     setKioskLoc]     = useState('Main Entrance');
  const [kioskPin,     setKioskPin]     = useState('0000');

  // ── Step 1: Validate URL ──────────────────────────────────────────────────

  const handleConnect = async () => {
    setError('');
    if (!url.trim()) { setError('Please enter your site URL.'); return; }
    setLoading(true);
    try {
      const validated = await validateAndConnect(url);
      const label = validated.replace(/^https?:\/\//, '');
      await saveSiteConfig(validated, label);
      setCleanUrl(validated);
      setStep('mode');
    } catch (err) {
      setError(err.message || 'Could not connect to the site.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2a: Employee Mode ────────────────────────────────────────────────

  const handleEmployeeMode = () => {
    onSiteConfigured({ mode: 'employee' });
  };

  // ── Step 2b: Kiosk Setup ──────────────────────────────────────────────────

  const handleKioskSetup = async () => {
    setError('');
    if (!kioskKey.trim()) { setError('Please enter the Kiosk API Key.'); return; }
    if (!kioskKey.includes(':')) { setError('API Key must be in format apiKey:apiSecret'); return; }
    setLoading(true);
    try {
      await saveKioskConfig({ apiKey: btoa(kioskKey.trim()), location: kioskLoc.trim(), pin: kioskPin.trim() || '0000' });
      onSiteConfigured({ mode: 'kiosk' });
    } catch (err) {
      setError(err.message || 'Could not save kiosk configuration.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render: URL Step ──────────────────────────────────────────────────────

  if (step === 'url') {
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
  }

  // ── Render: Mode Selection ────────────────────────────────────────────────

  if (step === 'mode') {
    return (
      <View style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <View style={[s.logoBox, { backgroundColor: C.brand }]}><Text style={s.logoIcon}>✓</Text></View>
            <Text style={s.appName}>Connected!</Text>
            <Text style={s.tagline}>{cleanUrl.replace(/^https?:\/\//, '')}</Text>
          </View>

          <Text style={s.modeTitle}>How will this device be used?</Text>

          {/* Employee Mode */}
          <TouchableOpacity style={s.modeCard} onPress={handleEmployeeMode} activeOpacity={0.85}>
            <View style={s.modeIcon}><Text style={s.modeEmoji}>👤</Text></View>
            <View style={s.modeInfo}>
              <Text style={s.modeName}>Employee Mode</Text>
              <Text style={s.modeSub}>Staff log in personally. Punch in/out with selfie + GPS. Access leaves, salary, shifts.</Text>
            </View>
            <Text style={s.modeArrow}>›</Text>
          </TouchableOpacity>

          {/* Kiosk Mode */}
          <TouchableOpacity style={s.modeCard} onPress={() => setStep('kiosk_setup')} activeOpacity={0.85}>
            <View style={[s.modeIcon, { backgroundColor: C.warnLight }]}><Text style={s.modeEmoji}>🏫</Text></View>
            <View style={s.modeInfo}>
              <Text style={s.modeName}>Kiosk Mode</Text>
              <Text style={s.modeSub}>Fixed device at entrance. Any person enters their ID to check in/out. No login required.</Text>
            </View>
            <Text style={s.modeArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.backBtn} onPress={() => setStep('url')}>
            <Text style={s.backText}>← Change URL</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Render: Kiosk Setup ───────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View style={[s.logoBox, { backgroundColor: C.warn }]}><Text style={s.logoIcon}>🏫</Text></View>
          <Text style={s.appName}>Kiosk Setup</Text>
          <Text style={s.tagline}>Configure this device as an attendance kiosk</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Kiosk Configuration</Text>
          <Text style={s.cardSub}>
            Create a dedicated Frappe API Key for the kiosk user, then paste it below.{'\n'}
            Format: <Text style={{ color: C.brand }}>apiKey:apiSecret</Text>
          </Text>

          <Text style={s.label}>Kiosk API Key *</Text>
          <TextInput
            style={[s.input, error && s.inputError]}
            placeholder="abc123:def456xyz"
            value={kioskKey}
            onChangeText={(t) => { setKioskKey(t); setError(''); }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={C.textMuted}
          />

          <Text style={s.label}>Location / Kiosk Name</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Main Entrance, Gate 1"
            value={kioskLoc}
            onChangeText={setKioskLoc}
            placeholderTextColor={C.textMuted}
          />

          <Text style={s.label}>Admin Exit PIN (4 digits)</Text>
          <TextInput
            style={s.input}
            placeholder="0000"
            value={kioskPin}
            onChangeText={setKioskPin}
            keyboardType="numeric"
            maxLength={4}
            placeholderTextColor={C.textMuted}
          />
          <Text style={s.hint}>This PIN lets admin exit kiosk mode from the device.</Text>

          {error ? <View style={s.errorBox}><Text style={s.errorText}>⚠ {error}</Text></View> : null}

          <TouchableOpacity style={[s.btn, { backgroundColor: C.warn }, loading && s.btnOff]} onPress={handleKioskSetup} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Start Kiosk →</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.backBtn} onPress={() => { setError(''); setStep('mode'); }}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
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

  // Mode selection
  modeTitle: { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginBottom: 16, textAlign: 'center' },
  modeCard:  { backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6 },
  modeIcon:  { width: 54, height: 54, borderRadius: 14, backgroundColor: C.brandLight, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  modeEmoji: { fontSize: 26 },
  modeInfo:  { flex: 1 },
  modeName:  { fontSize: 17, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
  modeSub:   { fontSize: 13, color: C.textMuted, lineHeight: 18 },
  modeArrow: { fontSize: 24, color: C.textMuted, marginLeft: 8 },

  backBtn:  { alignItems: 'center', paddingVertical: 12 },
  backText: { color: C.textSecond, fontSize: 14, fontWeight: '600' },
});

export default SiteSetupScreen;
