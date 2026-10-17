import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecret, setSecret, deleteSecret } from './secureStore';

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

export const clearSiteConfig = async () => {
  await AsyncStorage.multiRemove([KEY_URL, KEY_LABEL, KEY_KIOSK_MODE, KEY_KIOSK_LOC]);
  await Promise.all([deleteSecret(KEY_KIOSK_KEY), deleteSecret(KEY_KIOSK_PIN)]);
};

// ── Kiosk ─────────────────────────────────────────────────────────────────────

export const isKioskMode = async () => (await AsyncStorage.getItem(KEY_KIOSK_MODE)) === 'true';

export const saveKioskConfig = async ({ apiKey, location, pin }) => {
  await AsyncStorage.multiSet([
    [KEY_KIOSK_MODE, 'true'],
    [KEY_KIOSK_LOC,  location || 'Main Entrance'],
  ]);
  // Both secrets live in SecureStore (Keystore-backed), not AsyncStorage.
  await setSecret(KEY_KIOSK_KEY, apiKey);
  await setSecret(KEY_KIOSK_PIN, pin);
};

// Rejected as kiosk exit PINs: anyone at the kiosk would try these first.
const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666',
  '7777', '8888', '9999', '1234', '4321', '1212', '0123', '9876']);

/** Error message for an unacceptable kiosk PIN, or '' if it is fine. */
export const kioskPinProblem = (pin) => {
  if (!/^\d{4}$/.test(pin || '')) return 'The admin PIN must be exactly 4 digits.';
  if (WEAK_PINS.has(pin)) return 'That PIN is too easy to guess. Please choose another.';
  return '';
};

export const getKioskConfig = async () => {
  const location = await AsyncStorage.getItem(KEY_KIOSK_LOC);
  // getSecret also migrates a PIN that older builds kept in plain AsyncStorage.
  const [apiKey, pin] = await Promise.all([getSecret(KEY_KIOSK_KEY), getSecret(KEY_KIOSK_PIN)]);
  // '0000' only for kiosks set up before a PIN was required, so they can
  // still be exited; new setups cannot choose it (see kioskPinProblem).
  return { apiKey: apiKey || '', location: location || 'Main Entrance', pin: pin || '0000' };
};

export const clearKioskMode = async () => {
  await AsyncStorage.multiRemove([KEY_KIOSK_MODE, KEY_KIOSK_LOC]);
  await Promise.all([deleteSecret(KEY_KIOSK_KEY), deleteSecret(KEY_KIOSK_PIN)]);
};

// ── Validation ────────────────────────────────────────────────────────────────

// Plain http sends the login password unencrypted, so it is only accepted for
// hosts on a local network (a dev bench, an office server). The app still
// allows cleartext traffic for exactly this case.
const isLocalHost = (host) =>
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host)
  || host.endsWith('.local');

export const validateAndConnect = async (rawUrl) => {
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  if (url.startsWith('http://')) {
    const host = url.slice('http://'.length).split(/[/:?#]/)[0].toLowerCase();
    if (!isLocalHost(host)) {
      throw new Error('For security, use an https:// address. Plain http:// is only allowed for a server on your local network.');
    }
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
