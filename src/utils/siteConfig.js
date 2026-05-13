import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_URL   = 'siteUrl';
const KEY_LABEL = 'siteLabel';

export const getSiteUrl = () => AsyncStorage.getItem(KEY_URL);

export const getSiteLabel = () => AsyncStorage.getItem(KEY_LABEL);

export const isSiteConfigured = async () => !!(await AsyncStorage.getItem(KEY_URL));

export const saveSiteConfig = async (url, label) =>
  AsyncStorage.multiSet([[KEY_URL, url], [KEY_LABEL, label || url]]);

export const clearSiteConfig = () =>
  AsyncStorage.multiRemove([KEY_URL, KEY_LABEL]);

/**
 * Normalises the URL, pings /api/method/ping to confirm it's a live Frappe site,
 * and returns the cleaned URL on success.
 */
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
