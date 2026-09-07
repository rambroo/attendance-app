// Theming.
//
// The hard part: `StyleSheet.create({ color: C.bg })` copies the *value* at
// module-load time, so mutating a colour object later changes nothing. Every
// stylesheet in the app is created at import time, long before the user picks
// a theme.
//
// So stylesheets are registered rather than just created. `themed(factory)`
// returns a stable object reference and remembers how to rebuild it; switching
// theme re-runs every factory and refills those same objects in place. Callers
// keep using `styles.foo` exactly as before, with no per-access indirection and
// no Proxy overhead in the render path.
//
// Usage in a screen:
//
//   const styles = themed(() => StyleSheet.create({ box: { backgroundColor: C.card } }));
//
// Components re-render because the root remounts on theme change (see App.js).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'themeName';

// ── Palettes ─────────────────────────────────────────────────────────────────
//
// Every palette must define every token — a missing one is a transparent hole
// at runtime, so completeness is asserted in development (see below).
//
// Token groups:
//   brand/semantic — accents and status colours
//   surfaces       — bg, cards, borders
//   text           — on light/neutral surfaces
//   hero           — the coloured header block behind the clock
//   shell          — full-bleed dark UI: camera, punch preview, kiosk
//   scrim          — modal backdrops

const daylight = {
  // Brand
  primary:    '#1A6B47',
  brand:      '#3CC88F',
  brandDark:  '#2BAA78',
  brandLight: '#E8F9F3',
  onBrand:    '#FFFFFF',

  // Semantic
  in:         '#3CC88F',
  inLight:    '#E8F9F3',
  out:        '#E53935',
  outLight:   '#FFEBEE',
  warn:       '#F59E0B',
  warnLight:  '#FEF3C7',
  warnText:   '#B45309',
  error:      '#E53935',
  errorLight: '#FFEBEE',
  errorText:  '#991B1B',
  info:       '#3B82F6',
  infoLight:  '#DBEAFE',
  infoText:   '#1D4ED8',
  leave:      '#9333EA',
  holiday:    '#8B5CF6',
  neutral:    '#6B7280',
  inText:        '#065F46',
  outText:       '#991B1B',
  leaveLight:    '#F3E8FF',
  infoBorder:    '#BFDBFE',
  tileIdle:      '#E9E9E9',
  tileIdleText:  '#BDBDBD',
  heroDanger:    '#FCA5A5',

  // Surfaces
  bg:         '#F2F8F5',
  card:       '#FFFFFF',
  cardAlt:    '#F7FBF9',
  elevated:   '#FFFFFF',
  border:     '#DCF0E6',
  divider:    '#F3F4F6',

  // Text
  textPrimary: '#1C2E25',
  textSecond:  '#4E7264',
  textMuted:   '#91AEA5',
  textFaint:   '#B9CFC7',

  // Hero (coloured header)
  hero:          '#1A6B47',
  heroText:      '#FFFFFF',
  heroTextMuted: 'rgba(255,255,255,0.65)',
  heroTextFaint: 'rgba(255,255,255,0.45)',
  heroChip:      'rgba(255,255,255,0.12)',
  heroChipOn:    'rgba(60,200,143,0.20)',
  heroBorder:    'rgba(255,255,255,0.40)',
  heroAvatar:    'rgba(255,255,255,0.20)',
  heroWarnChip:  'rgba(245,158,11,0.22)',
  heroWarnText:  '#FDE68A',
  heroInfoChip:  'rgba(59,130,246,0.22)',
  heroInfoText:  '#BFDBFE',

  // Shell (camera, punch preview, kiosk — always dark, by design)
  shell:          '#000000',
  shellDeep:      '#0A0A0A',
  shellPanel:     '#111111',
  shellCard:      '#1A1A1A',
  shellText:      '#FFFFFF',
  shellTextMuted: '#9CA3AF',
  shellTextFaint: '#6B7280',
  shellBorder:    '#374151',
  shellInput:     'rgba(255,255,255,0.07)',
  shellInputEdge: 'rgba(255,255,255,0.12)',
  shellOverlay:   'rgba(0,0,0,0.45)',
  shellOkTint:    'rgba(60,200,143,0.10)',
  shellWarnTint:  'rgba(245,158,11,0.10)',
  shellWarnEdge:  'rgba(245,158,11,0.50)',

  // Kiosk
  kioskBg:     '#0D1F17',
  kioskCard:   'rgba(255,255,255,0.06)',
  kioskBorder: 'rgba(255,255,255,0.10)',
  kioskResult: 'rgba(13,31,23,0.97)',

  scrim:      'rgba(0,0,0,0.75)',
  scrimLight: 'rgba(0,0,0,0.45)',
  shadow:     '#000000',

  statusBar: 'light-content',
};

// True dark, brand preserved — familiar, just easier on the eyes at night.
const midnight = {
  primary:    '#123027',
  brand:      '#3CC88F',
  brandDark:  '#2BAA78',
  brandLight: '#12332A',
  onBrand:    '#04150F',

  in:         '#3CC88F',
  inLight:    '#12332A',
  out:        '#FF6B6B',
  outLight:   '#3A1E20',
  warn:       '#FBBF24',
  warnLight:  '#3A2E14',
  warnText:   '#FCD34D',
  error:      '#FF6B6B',
  errorLight: '#3A1E20',
  errorText:  '#FCA5A5',
  info:       '#60A5FA',
  infoLight:  '#1B2A3F',
  infoText:   '#BFDBFE',
  leave:      '#A855F7',
  holiday:    '#8B5CF6',
  neutral:    '#8A9E96',
  inText:        '#6EE7B7',
  outText:       '#FCA5A5',
  leaveLight:    '#2A1F3A',
  infoBorder:    '#2F4560',
  tileIdle:      '#1B2621',
  tileIdleText:  '#7E9A8F',
  heroDanger:    '#FCA5A5',

  bg:         '#0E1512',
  card:       '#16201C',
  cardAlt:    '#1C2823',
  elevated:   '#1A241F',
  border:     '#24332C',
  divider:    '#1F2C26',

  textPrimary: '#E6F0EB',
  textSecond:  '#A9C2B8',
  textMuted:   '#6E8B80',
  textFaint:   '#4E655C',

  hero:          '#123027',
  heroText:      '#E6F0EB',
  heroTextMuted: 'rgba(230,240,235,0.62)',
  heroTextFaint: 'rgba(230,240,235,0.40)',
  heroChip:      'rgba(255,255,255,0.08)',
  heroChipOn:    'rgba(60,200,143,0.18)',
  heroBorder:    'rgba(230,240,235,0.28)',
  heroAvatar:    'rgba(255,255,255,0.12)',
  heroWarnChip:  'rgba(251,191,36,0.20)',
  heroWarnText:  '#FCD34D',
  heroInfoChip:  'rgba(96,165,250,0.20)',
  heroInfoText:  '#BFDBFE',

  shell:          '#000000',
  shellDeep:      '#070B09',
  shellPanel:     '#101614',
  shellCard:      '#161E1A',
  shellText:      '#E6F0EB',
  shellTextMuted: '#8FA79C',
  shellTextFaint: '#63796F',
  shellBorder:    '#2A3831',
  shellInput:     'rgba(255,255,255,0.06)',
  shellInputEdge: 'rgba(255,255,255,0.10)',
  shellOverlay:   'rgba(0,0,0,0.55)',
  shellOkTint:    'rgba(60,200,143,0.12)',
  shellWarnTint:  'rgba(251,191,36,0.12)',
  shellWarnEdge:  'rgba(251,191,36,0.50)',

  kioskBg:     '#0B1712',
  kioskCard:   'rgba(255,255,255,0.05)',
  kioskBorder: 'rgba(255,255,255,0.09)',
  kioskResult: 'rgba(8,18,14,0.98)',

  scrim:      'rgba(0,0,0,0.80)',
  scrimLight: 'rgba(0,0,0,0.55)',
  shadow:     '#000000',

  statusBar: 'light-content',
};

// Near-black charcoal with a champagne accent. Warmer and quieter than
// Midnight; IN/OUT stay mint/terracotta so status is never carried by the
// accent colour alone.
const onyx = {
  primary:    '#101013',
  brand:      '#D4AF7A',
  brandDark:  '#B8935E',
  brandLight: '#241F17',
  onBrand:    '#141013',

  in:         '#7FD1A8',
  inLight:    '#16241D',
  out:        '#E0796B',
  outLight:   '#2A1917',
  warn:       '#E0B15C',
  warnLight:  '#2A2216',
  warnText:   '#EBC77F',
  error:      '#E0796B',
  errorLight: '#2A1917',
  errorText:  '#F0A79B',
  info:       '#8FB3D9',
  infoLight:  '#1A2029',
  infoText:   '#BDD4EC',
  leave:      '#B39DDB',
  holiday:    '#9F86C0',
  neutral:    '#8A857C',
  inText:        '#9EDCBB',
  outText:       '#F0A79B',
  leaveLight:    '#211C2B',
  infoBorder:    '#33404F',
  tileIdle:      '#1B1B20',
  tileIdleText:  '#8A8479',
  heroDanger:    '#F0A79B',

  bg:         '#0B0B0D',
  card:       '#141417',
  cardAlt:    '#1B1B20',
  elevated:   '#18181C',
  border:     '#26262C',
  divider:    '#1F1F24',

  textPrimary: '#F2EFE9',
  textSecond:  '#B8B2A8',
  textMuted:   '#7C766D',
  textFaint:   '#5A554E',

  hero:          '#101013',
  heroText:      '#F2EFE9',
  heroTextMuted: 'rgba(242,239,233,0.60)',
  heroTextFaint: 'rgba(242,239,233,0.38)',
  heroChip:      'rgba(255,255,255,0.06)',
  heroChipOn:    'rgba(212,175,122,0.16)',
  heroBorder:    'rgba(212,175,122,0.35)',
  heroAvatar:    'rgba(212,175,122,0.14)',
  heroWarnChip:  'rgba(224,177,92,0.18)',
  heroWarnText:  '#EBC77F',
  heroInfoChip:  'rgba(143,179,217,0.18)',
  heroInfoText:  '#C8DAEE',

  shell:          '#000000',
  shellDeep:      '#08080A',
  shellPanel:     '#121215',
  shellCard:      '#1A1A1E',
  shellText:      '#F2EFE9',
  shellTextMuted: '#9E988E',
  shellTextFaint: '#6E6961',
  shellBorder:    '#2F2F36',
  shellInput:     'rgba(255,255,255,0.05)',
  shellInputEdge: 'rgba(255,255,255,0.10)',
  shellOverlay:   'rgba(0,0,0,0.50)',
  shellOkTint:    'rgba(127,209,168,0.12)',
  shellWarnTint:  'rgba(224,177,92,0.12)',
  shellWarnEdge:  'rgba(224,177,92,0.50)',

  kioskBg:     '#0B0B0D',
  kioskCard:   'rgba(255,255,255,0.05)',
  kioskBorder: 'rgba(212,175,122,0.18)',
  kioskResult: 'rgba(9,9,11,0.98)',

  scrim:      'rgba(0,0,0,0.82)',
  scrimLight: 'rgba(0,0,0,0.55)',
  shadow:     '#000000',

  statusBar: 'light-content',
};

const PALETTES = { daylight, midnight, onyx };

/** Ordered list for the picker. */
export const THEMES = [
  { key: 'daylight', label: 'Daylight', hint: 'Bright, the original look',   swatch: ['#F2F8F5', '#1A6B47', '#3CC88F'] },
  { key: 'midnight', label: 'Midnight', hint: 'Dark, same emerald brand',    swatch: ['#0E1512', '#16201C', '#3CC88F'] },
  { key: 'onyx',     label: 'Onyx',     hint: 'Charcoal with champagne',     swatch: ['#0B0B0D', '#141417', '#D4AF7A'] },
];

export const DEFAULT_THEME = 'daylight';

// ── Live token object ────────────────────────────────────────────────────────
//
// `C` keeps the same identity forever; only its contents change. That is what
// lets existing `import { C } from '../utils/theme'` call sites keep working.

export const C = {};

let activeName = DEFAULT_THEME;

const applyPalette = (name) => {
  const palette = PALETTES[name] || PALETTES[DEFAULT_THEME];
  for (const key of Object.keys(C)) delete C[key];
  Object.assign(C, palette);
  activeName = PALETTES[name] ? name : DEFAULT_THEME;
};

applyPalette(DEFAULT_THEME);   // must run before any themed() call below

if (__DEV__) {
  // A token present in one palette but missing from another renders as
  // `undefined` — an invisible element rather than a crash. Catch it loudly.
  const reference = Object.keys(daylight);
  for (const [name, palette] of Object.entries(PALETTES)) {
    const missing = reference.filter((k) => !(k in palette));
    const extra   = Object.keys(palette).filter((k) => !reference.includes(k));
    if (missing.length) console.warn(`Theme "${name}" is missing tokens:`, missing.join(', '));
    if (extra.length)   console.warn(`Theme "${name}" has unknown tokens:`, extra.join(', '));
  }
}

// ── Themed stylesheets ───────────────────────────────────────────────────────

const factories = new Set();

/**
 * Register a stylesheet that should follow the active theme.
 *
 * Returns a stable object; on theme change its contents are replaced in place,
 * so every existing reference sees the new values.
 */
export const themed = (factory) => {
  const holder = {};
  const build = () => {
    const next = factory();
    for (const key of Object.keys(holder)) delete holder[key];
    Object.assign(holder, next);
  };
  factories.add(build);
  build();
  return holder;
};

const rebuildAll = () => factories.forEach((build) => build());

// ── Public API ───────────────────────────────────────────────────────────────

const listeners = new Set();

export const getThemeName = () => activeName;

/** Switch theme, rebuild every stylesheet, persist, and notify subscribers. */
export const setTheme = async (name, { persist = true } = {}) => {
  if (!PALETTES[name] || name === activeName) return activeName;
  applyPalette(name);
  rebuildAll();
  listeners.forEach((fn) => { try { fn(activeName); } catch { /* ignore */ } });
  if (persist) AsyncStorage.setItem(STORAGE_KEY, activeName).catch(() => {});
  return activeName;
};

/**
 * Restore the saved theme. Call before the splash screen hides, so the first
 * painted frame is already in the right theme rather than flashing light.
 */
export const loadSavedTheme = async () => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && PALETTES[saved] && saved !== activeName) {
      applyPalette(saved);
      rebuildAll();
    }
  } catch { /* keep the default */ }
  return activeName;
};

export const subscribeToTheme = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Re-render a component when the theme changes. */
export const useThemeName = () => {
  const [name, setName] = useState(activeName);
  useEffect(() => subscribeToTheme(setName), []);
  return name;
};
