// App-wide location tracking.
//
// The punch screen used to fetch location itself, while the camera was open.
// That is where the blank-camera bug came from: asking for location permission,
// or for Android to turn location on, puts a system dialog over the app, which
// pauses it with the camera running, and the preview can come back black.
//
// So location is handled up front instead. When the main app opens we ask for
// permission (and to turn location on) once, then watch the position for as
// long as the app is in the foreground. The punch screen only reads the latest
// position from here — it never requests permission, never opens a system
// dialog and never waits for a GPS fix.
//
// Tracking pauses while the app is in the background (no background location
// permission is needed, and it saves battery) and resumes when it returns.

import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { useEffect, useState } from 'react';

// A fix older than this is not trusted for a punch. The watch normally
// refreshes every ~10 s, so this only trips if GPS has stopped updating.
const STALE_MS = 5 * 60 * 1000;
// No first fix this long after starting → report 'error' so the punch screen
// can offer a retry. The watch keeps running; a later fix still lands.
const FIRST_FIX_TIMEOUT_MS = 20000;
const GEOCODE_MIN_INTERVAL_MS = 60000;
const GEOCODE_MIN_MOVE_M = 100;

// status: 'idle' | 'fetching' | 'ok' | 'error' | 'denied' | 'off'
let state = { status: 'idle', location: null, updatedAt: 0 };
const listeners = new Set();

let running = false;
let generation = 0;          // bumps on every (re)start; stale async work checks it
let watchSub = null;
let appStateSub = null;
let firstFixTimer = null;
let lastGeocode = { at: 0, latitude: null, longitude: null };

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => { try { fn(state); } catch { /* ignore */ } });
};

// Rough distance in metres; plenty for "has the phone moved".
const metresBetween = (a, b) => {
  const dLat = (a.latitude - b.latitude) * 111320;
  const dLng = (a.longitude - b.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

const maybeGeocode = async (gen, latitude, longitude) => {
  const now = Date.now();
  const moved = lastGeocode.latitude == null
    || metresBetween({ latitude, longitude }, lastGeocode) > GEOCODE_MIN_MOVE_M;
  if (!moved && state.location?.address) return;
  if (now - lastGeocode.at < GEOCODE_MIN_INTERVAL_MS) return;
  lastGeocode = { at: now, latitude, longitude };
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (gen !== generation || !places?.length) return;
    const p = places[0];
    const address = [p.name, p.street, p.district, p.city].filter(Boolean).slice(0, 3).join(', ');
    if (address && state.location) setState({ location: { ...state.location, address } });
  } catch { /* address is optional */ }
};

const applyPosition = (gen, pos) => {
  if (gen !== generation || !pos?.coords) return;
  const { latitude, longitude } = pos.coords;
  const prev = state.location;
  // Keep the old address until a new one is looked up, unless we moved far.
  const keepAddress = prev && metresBetween(prev, { latitude, longitude }) <= GEOCODE_MIN_MOVE_M;
  clearTimeout(firstFixTimer);
  setState({
    status: 'ok',
    location: { latitude, longitude, address: keepAddress ? prev.address : '' },
    updatedAt: pos.timestamp || Date.now(),
  });
  maybeGeocode(gen, latitude, longitude);
};

const stopWatch = () => {
  generation += 1;
  clearTimeout(firstFixTimer);
  try { watchSub?.remove(); } catch { /* ignore */ }
  watchSub = null;
};

// promptUser: true only when it is safe for Android to show a dialog —
// at app start, or from an explicit tap while no camera is open.
const beginWatch = async ({ promptUser }) => {
  stopWatch();
  const gen = generation;
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && promptUser && perm.canAskAgain !== false) {
      perm = await Location.requestForegroundPermissionsAsync();
    }
    if (gen !== generation) return;
    if (!perm.granted) { setState({ status: 'denied' }); return; }

    let enabled = await Location.hasServicesEnabledAsync();
    if (!enabled && promptUser) {
      try { await Location.enableNetworkProviderAsync(); } catch { /* user declined */ }
      enabled = await Location.hasServicesEnabledAsync();
    }
    if (gen !== generation) return;
    if (!enabled) { setState({ status: 'off' }); return; }

    if (state.status !== 'ok') setState({ status: 'fetching' });
    firstFixTimer = setTimeout(() => {
      if (gen === generation && state.status === 'fetching') setState({ status: 'error' });
    }, FIRST_FIX_TIMEOUT_MS);

    // Seed instantly from a recent cached fix, then keep watching.
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
      if (last) applyPosition(gen, last);
    } catch { /* fine, the watch will deliver */ }

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 10,
        mayShowUserSettingsDialog: false,   // never surprise the user with a dialog
      },
      (pos) => applyPosition(gen, pos),
      () => { if (gen === generation && state.status !== 'ok') setState({ status: 'error' }); },
    );
    if (gen !== generation) { sub.remove(); return; }
    watchSub = sub;
  } catch {
    if (gen === generation && state.status !== 'ok') setState({ status: 'error' });
  }
};

/** Start tracking for this app session. Safe to call more than once. */
export const startLocationTracking = () => {
  if (running) return;
  running = true;
  beginWatch({ promptUser: true });
  appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') beginWatch({ promptUser: false });
    else if (s === 'background') stopWatch();
  });
};

export const stopLocationTracking = () => {
  running = false;
  stopWatch();
  appStateSub?.remove();
  appStateSub = null;
};

/**
 * Restart the watch now. promptUser: true may open Android's permission or
 * "turn on location" dialog — only pass it when no camera is open.
 */
export const refreshLocation = ({ promptUser = false } = {}) => beginWatch({ promptUser });

export const getLocationState = () => state;

/** Latest tracked location; re-renders on change. A stale fix reads as 'fetching'. */
export const useTrackedLocation = () => {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => listeners.delete(setS);
  }, []);
  const stale = s.status === 'ok' && Date.now() - s.updatedAt > STALE_MS;
  return {
    status: s.status === 'idle' || stale ? 'fetching' : s.status,
    location: stale ? null : s.location,
  };
};
