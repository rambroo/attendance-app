import React, { memo, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Pressable,
} from 'react-native';
import { C, themed, THEMES, setTheme, useThemeName } from '../utils/theme';

// Appearance picker.
//
// Switching theme remounts the app tree (App.js keys on the theme name), so the
// sheet closes itself first — otherwise it would be torn down mid-animation and
// the change would look like a glitch rather than a choice.

const Swatch = memo(({ colors }) => (
  <View style={S.swatch}>
    {colors.map((color, i) => (
      <View
        key={i}
        style={[
          S.swatchDot,
          { backgroundColor: color },
          i > 0 && S.swatchDotOverlap,
        ]}
      />
    ))}
  </View>
));

const ThemeRow = memo(({ theme, active, onSelect }) => (
  <TouchableOpacity
    style={[S.row, active && S.rowActive]}
    onPress={() => onSelect(theme.key)}
    activeOpacity={0.75}
    accessibilityRole="radio"
    accessibilityState={{ selected: active }}
    accessibilityLabel={`${theme.label}. ${theme.hint}`}
  >
    <Swatch colors={theme.swatch} />
    <View style={S.rowText}>
      <Text style={S.rowLabel}>{theme.label}</Text>
      <Text style={S.rowHint}>{theme.hint}</Text>
    </View>
    <View style={[S.check, active && S.checkOn]}>
      {active ? <Text style={S.checkMark}>✓</Text> : null}
    </View>
  </TouchableOpacity>
));

const ThemePicker = ({ visible, onClose }) => {
  const active = useThemeName();

  const handleSelect = useCallback(async (key) => {
    onClose();                 // close before the remount, not after
    if (key !== active) await setTheme(key);
  }, [active, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.overlay} onPress={onClose}>
        {/* Stop taps inside the sheet from dismissing it. */}
        <Pressable style={S.sheet} onPress={() => {}}>
          <View style={S.handle} />
          <Text style={S.title}>Appearance</Text>
          <Text style={S.sub}>Applies everywhere and is remembered on this device.</Text>

          {THEMES.map((theme) => (
            <ThemeRow
              key={theme.key}
              theme={theme}
              active={theme.key === active}
              onSelect={handleSelect}
            />
          ))}

          <TouchableOpacity style={S.done} onPress={onClose} activeOpacity={0.8}>
            <Text style={S.doneText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const S = themed(() => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.elevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginBottom: 4 },
  sub:   { fontSize: 13, color: C.textMuted, marginBottom: 18, lineHeight: 19 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 16, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.card, marginBottom: 10,
  },
  rowActive: { borderColor: C.brand, backgroundColor: C.brandLight },
  rowText:   { flex: 1, marginLeft: 14 },
  rowLabel:  { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  rowHint:   { fontSize: 12, color: C.textMuted, marginTop: 2 },

  swatch:     { flexDirection: 'row', alignItems: 'center' },
  swatchDot:  {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: C.border,
  },
  swatchDotOverlap: { marginLeft: -8 },

  check: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn:   { backgroundColor: C.brand, borderColor: C.brand },
  checkMark: { color: C.onBrand, fontSize: 13, fontWeight: '800' },

  done: {
    marginTop: 6, paddingVertical: 14, borderRadius: 50,
    alignItems: 'center', backgroundColor: C.cardAlt,
    borderWidth: 1, borderColor: C.border,
  },
  doneText: { fontSize: 15, fontWeight: '700', color: C.textSecond },
}));

export default memo(ThemePicker);
