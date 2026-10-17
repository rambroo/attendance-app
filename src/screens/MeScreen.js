import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, themed, THEMES, useThemeName } from '../utils/theme';
import { getBuildTag } from '../utils/buildInfo';
import ThemePicker from '../components/ThemePicker';

// The "Me" tab: who you are, then everything that isn't punching or tasks.
// New features that don't deserve their own tab go in SECTIONS.
const SECTIONS = [
  {
    title: 'My work',
    rows: [
      { icon: 'leaf-outline', label: 'Leaves',     sub: 'Balance, apply, holidays',      route: 'Leaves' },
      { icon: 'calendar-outline', label: 'Shifts',     sub: 'Your shifts and requests',      route: 'Shifts' },
      { icon: 'wallet-outline', label: 'Salary slips', sub: 'Monthly pay slips',           route: 'Salary' },
    ],
  },
];

const Row = ({ icon, label, sub, value, onPress, last, danger }) => (
  <TouchableOpacity style={[s.row, last && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.7}>
    <View style={[s.rowIcon, danger && { backgroundColor: C.errorLight }]}>
      <Ionicons name={icon} size={19} color={danger ? C.error : C.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[s.rowLabel, danger && { color: C.error }]}>{label}</Text>
      {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
    </View>
    {value ? <Text style={s.rowValue}>{value}</Text> : null}
    {danger ? null : <Ionicons name="chevron-forward" size={18} color={C.textFaint} style={{ marginLeft: 4 }} />}
  </TouchableOpacity>
);

export default function MeScreen({ navigation, onLogout }) {
  const [me, setMe]               = useState({});
  const [themesOpen, setThemesOpen] = useState(false);
  const themeName = useThemeName();

  useEffect(() => {
    AsyncStorage.multiGet(['employeeName', 'designation', 'department', 'userEmail', 'userName'])
      .then((pairs) => setMe(Object.fromEntries(pairs)))
      .catch(() => {});
  }, []);

  const openThemes  = useCallback(() => setThemesOpen(true), []);
  const closeThemes = useCallback(() => setThemesOpen(false), []);

  const name = me.employeeName || me.userName || '—';
  const role = [me.designation, me.department].filter(Boolean).join(' · ');
  const themeLabel = THEMES.find((t) => t.key === themeName)?.label;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ThemePicker visible={themesOpen} onClose={closeThemes} />

      <View style={s.hero}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{name[0] === '—' ? 'U' : name[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          {role ? <Text style={s.role} numberOfLines={1}>{role}</Text> : null}
          {me.userEmail ? <Text style={s.email} numberOfLines={1}>{me.userEmail}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {SECTIONS.map((sec) => (
          <View key={sec.title}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <View style={s.group}>
              {sec.rows.map((r, i) => (
                <Row key={r.route} {...r} last={i === sec.rows.length - 1} onPress={() => navigation.navigate(r.route)} />
              ))}
            </View>
          </View>
        ))}

        <Text style={s.sectionTitle}>App</Text>
        <View style={s.group}>
          <Row icon="color-palette-outline" label="Theme" value={themeLabel} onPress={openThemes} />
          <Row icon="log-out-outline" label="Log out" onPress={onLogout} last danger />
        </View>

        <Text style={s.buildTag}>{getBuildTag()}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  hero:        { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 22 },
  avatar:      { width: 56, height: 56, borderRadius: 28, backgroundColor: C.heroAvatar, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarText:  { fontSize: 24, fontWeight: '700', color: C.heroText },
  name:        { fontSize: 19, fontWeight: '700', color: C.heroText },
  role:        { fontSize: 13, color: C.heroTextMuted, marginTop: 2 },
  email:       { fontSize: 12, color: C.heroTextFaint, marginTop: 2 },

  body:        { padding: 16, paddingBottom: 32 },
  sectionTitle:{ fontSize: 12, fontWeight: '700', color: C.textSecond, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8, marginBottom: 8, marginLeft: 4 },
  group:       { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 18, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.divider },
  rowIcon:     { width: 36, height: 36, borderRadius: 10, backgroundColor: C.brandLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowLabel:    { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  rowSub:      { fontSize: 12, color: C.textMuted, marginTop: 1 },
  rowValue:    { fontSize: 13, color: C.textMuted, marginRight: 6 },
  buildTag:    { textAlign: 'center', fontSize: 11, color: C.textFaint, marginTop: 4 },
}));
