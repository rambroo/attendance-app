import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_URL        = 'siteUrl';
const KEY_LABEL      = 'siteLabel';
const KEY_KIOSK_MODE = 'kioskMode';
const KEY_KIOSK_KEY  = 'kioskApiKey';
const KEY_KIOSK_LOC  = 'kioskLocation';
const KEY_KIOSK_PIN  = 'kioskPin';

// ── Site ─────────────────────────────────────────────────────────────────────

export const getSiteUrl   = () => AsyncStorage.getItem(KEY_URL);
export const getSiteLabel = () => AsyncStorage.getItem(KEY_LABEL);
export const isSiteConfigured = async () => !!(await AsyncStorage.getItem(KEY_URL));

export const saveSiteConfig = async (url, label) =>
  AsyncStorage.multiSet([[KEY_URL, url], [KEY_LABEL, label || url]]);

export const clearSiteConfig = () =>
  AsyncStorage.multiRemove([KEY_URL, KEY_LABEL, KEY_KIOSK_MODE, KEY_KIOSK_KEY, KEY_KIOSK_LOC, KEY_KIOSK_PIN]);

// ── Kiosk ─────────────────────────────────────────────────────────────────────

export const isKioskMode = async () => (await AsyncStorage.getItem(KEY_KIOSK_MODE)) === 'true';

export const saveKioskConfig = async ({ apiKey, location, pin }) => {
  await AsyncStorage.multiSet([
    [KEY_KIOSK_MODE, 'true'],
    [KEY_KIOSK_KEY,  apiKey],
    [KEY_KIOSK_LOC,  location || 'Main Entrance'],
    [KEY_KIOSK_PIN,  pin || '0000'],
  ]);
};

export const getKioskConfig = async () => {
  const [[, apiKey], [, location], [, pin]] = await AsyncStorage.multiGet([
    KEY_KIOSK_KEY, KEY_KIOSK_LOC, KEY_KIOSK_PIN,
  ]);
  return { apiKey: apiKey || '', location: location || 'Main Entrance', pin: pin || '0000' };
};

export const clearKioskMode = () =>
  AsyncStorage.multiRemove([KEY_KIOSK_MODE, KEY_KIOSK_KEY, KEY_KIOSK_LOC, KEY_KIOSK_PIN]);

// ── Validation ────────────────────────────────────────────────────────────────

export const validateAndConnect = async (rawUrl) => {
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const resp = await fetch(`${url}/api/method/ping`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`Server returned ${resp.status}. Is this a Frappe site?`);
    const data = await resp.json();
    if (data.message !== 'pong') throw new Error('URL did not respond as a Frappe/ERPNext site.');
    return url;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Connection timed out. Check the URL and try again.');
    if (err.message.includes('Network request failed')) {
      throw new Error('Could not reach the server. Check the URL and your internet connection.');
    }
    throw err;
  }
};
