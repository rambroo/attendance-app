// What does the connected site actually support?
//
// The app is multi-tenant, and not every Frappe site it connects to has the
// `next_attendance` app installed. Production (techniti.wecanwewillfdn.org) is
// currently one of those: its Person doctypes, custom fields and punch server
// scripts were built by hand in the UI, so `next_attendance.api.*` does not
// resolve there even though the punch flow works fine.
//
// That matters for selfie privacy. Private uploads are only safe on a site that
// can hand back signed URLs to read them again; on a site without the app, a
// private selfie would upload fine and then be unviewable. So we ask the site
// once, cache the answer per site, and behave accordingly:
//
//   app present  → upload private, render via signed URLs   (the good path)
//   app absent   → upload public,  render the direct URL    (today's behaviour)
//
// The upshot is that this improvement switches itself on the moment
// next_attendance is deployed, with no app release needed.

import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/apiClient';

const CACHE_PREFIX = 'server_caps_';
const TTL_MS = 24 * 60 * 60 * 1000;

// In-memory cache so a burst of punches doesn't re-read AsyncStorage.
let memo = { siteUrl: null, value: null };

const cacheKey = (siteUrl) => `${CACHE_PREFIX}${siteUrl}`;

/**
 * Does this site expose next_attendance's signed-selfie endpoints?
 *
 * Fails closed: any doubt returns false, which keeps selfies on the current
 * public path rather than uploading something that can never be displayed.
 */
export const hasPrivateSelfieSupport = async () => {
  const siteUrl = await AsyncStorage.getItem('siteUrl');
  if (!siteUrl) return false;

  if (memo.siteUrl === siteUrl && memo.value !== null) return memo.value;

  try {
    const raw = await AsyncStorage.getItem(cacheKey(siteUrl));
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - cached.checkedAt < TTL_MS) {
        memo = { siteUrl, value: cached.privateSelfies };
        return cached.privateSelfies;
      }
    }
  } catch { /* fall through and re-probe */ }

  let supported = false;
  try {
    // An empty batch is a valid call: it returns {} on a site that has the app,
    // and 404s on one that doesn't.
    await apiClient.post('/method/next_attendance.api.sign_selfies', {
      checkins: JSON.stringify([]),
    });
    supported = true;
  } catch {
    supported = false;
  }

  memo = { siteUrl, value: supported };
  AsyncStorage.setItem(
    cacheKey(siteUrl),
    JSON.stringify({ privateSelfies: supported, checkedAt: Date.now() })
  ).catch(() => {});
  return supported;
};

/** Drop the cached answer — call after login, or when changing site. */
export const resetServerCaps = async () => {
  memo = { siteUrl: null, value: null };
  try {
    const siteUrl = await AsyncStorage.getItem('siteUrl');
    if (siteUrl) await AsyncStorage.removeItem(cacheKey(siteUrl));
  } catch { /* best effort */ }
};
