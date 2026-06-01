import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSiteUrl, getKioskConfig } from '../utils/siteConfig';

// Build Basic auth header from stored kiosk API key (format: "apiKey:apiSecret")
const getKioskHeaders = async () => {
  const { apiKey } = await getKioskConfig();
  const siteUrl = await getSiteUrl();
  return { siteUrl, authHeader: `Basic ${apiKey}` };
};

const callMethod = async (method, params = {}) => {
  const { siteUrl, authHeader } = await getKioskHeaders();
  const qs = new URLSearchParams(params).toString();
  const url = `${siteUrl}/api/method/${method}${qs ? '?' + qs : ''}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const errData = await resp.json();
      if (errData._server_messages) {
        const msgs = JSON.parse(errData._server_messages);
        const parsed = JSON.parse(msgs[0]);
        errMsg = parsed.message || errMsg;
      } else if (errData.exception) {
        errMsg = errData.exception.split('\n').pop() || errMsg;
      }
    } catch { /* use raw status */ }
    throw new Error(errMsg);
  }

  const data = await resp.json();
  return data.message;
};

const postMethod = async (method, body = {}) => {
  const { siteUrl, authHeader } = await getKioskHeaders();

  const resp = await fetch(`${siteUrl}/api/method/${method}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const errData = await resp.json();
      if (errData._server_messages) {
        const msgs = JSON.parse(errData._server_messages);
        const parsed = JSON.parse(msgs[0]);
        errMsg = parsed.message || errMsg;
      }
    } catch { /* use raw status */ }
    throw new Error(errMsg);
  }

  const data = await resp.json();
  return data.message;
};

/**
 * Look up a person by their ID number.
 * Server returns: { person_name, person_type, group, image_url }
 */
export const lookupPerson = (idNumber) =>
  callMethod('techniti_kiosk_lookup', { id_number: idNumber });

/**
 * Upload a selfie photo for kiosk attendance.
 * Uses the same upload_file endpoint as employee punch.
 */
export const uploadKioskSelfie = async (photo) => {
  const { siteUrl, authHeader } = await getKioskHeaders();

  const formData = new FormData();
  formData.append('file', {
    uri:  photo.uri,
    name: `kiosk_selfie_${Date.now()}.jpg`,
    type: 'image/jpeg',
  });
  formData.append('is_private', '0');
  formData.append('folder', 'Home/Attachments');

  const resp = await fetch(`${siteUrl}/api/method/upload_file`, {
    method:  'POST',
    headers: { Authorization: authHeader, Accept: 'application/json' },
    body:    formData,
  });

  if (!resp.ok) throw new Error('Selfie upload failed');
  const data = await resp.json();
  return data.message?.file_url || '';
};

/**
 * Record a punch for a person identified by their ID number.
 * Optionally includes a selfie URL for attendance verification.
 * Server auto-detects IN/OUT. Returns: { person_name, person_type, log_type, time, selfie_url, image_url }
 */
export const kioskPunch = async (idNumber, selfieUrl = '') => {
  const { location } = await getKioskConfig();
  return postMethod('techniti_kiosk_punch', {
    id_number:  idNumber,
    location,
    device_id:  'kiosk',
    selfie_url: selfieUrl,
  });
};
