// Durable punch queue.
//
// Punching used to block the UI on the full network round trip: upload the
// selfie, create the check-in, then re-fetch the day's punches — 15–30 seconds
// on a weak uplink, with a spinner the whole time, and nothing to show for it
// if the connection dropped halfway.
//
// Now a punch is written here first and the UI moves on immediately. The queue
// drains in the background and survives app restarts, so a punch taken in a
// basement or on a patchy site connection still lands once the device is back
// online.
//
// The recorded time is always the moment of capture, never the moment of
// upload — attendance_app_punch takes `time` as a parameter, so a punch that
// syncs an hour late is still stored at the time it actually happened.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCheckin } from '../api/attendanceApi';

const QUEUE_KEY = 'punch_queue_v1';

// After this many failed sends we stop retrying and surface the punch as
// failed. This is also what stops a punch whose cached photo has been evicted
// by Android from retrying forever.
const MAX_ATTEMPTS = 5;

// ── Store ────────────────────────────────────────────────────────────────────

const listeners = new Set();
let flushing = false;

/** Subscribe to queue changes. Returns an unsubscribe function. */
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const notify = (queue) => listeners.forEach((fn) => {
  try { fn(queue); } catch { /* a bad listener must not break the queue */ }
});

export const readQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const writeQueue = async (queue) => {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* a full disk must not lose the in-memory punch */ }
  notify(queue);
  return queue;
};

// ── Queue operations ─────────────────────────────────────────────────────────

/**
 * Record a punch locally and return it immediately. The caller should render
 * this straight away and call flushQueue() without awaiting it.
 */
export const enqueuePunch = async ({ employeeId, logType, time, photoUri, location, notes }) => {
  const item = {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    employeeId,
    logType,
    time,                       // capture time — see module comment
    photoUri: photoUri || null,
    location: location || null,
    notes: notes || '',
    attempts: 0,
    lastError: null,
    failed: false,
  };
  const queue = await readQueue();
  await writeQueue([...queue, item]);
  return item;
};

/** Punches still waiting to sync for one employee (excludes failed ones). */
export const getPendingFor = async (employeeId) =>
  (await readQueue()).filter((p) => p.employeeId === employeeId && !p.failed);

/** Punches that were rejected outright and need the user to be told. */
export const getFailedFor = async (employeeId) =>
  (await readQueue()).filter((p) => p.employeeId === employeeId && p.failed);

export const removePunch = async (id) =>
  writeQueue((await readQueue()).filter((p) => p.id !== id));

/** Drop failed punches once the user has acknowledged them. */
export const clearFailedFor = async (employeeId) =>
  writeQueue((await readQueue()).filter((p) => !(p.employeeId === employeeId && p.failed)));

// ── Flush ────────────────────────────────────────────────────────────────────

// A punch that the server actively refused (geofence, validation, duplicate)
// will be refused again — retrying is pointless and hides the problem from the
// user. Anything else (no signal, timeout, expired session) is worth retrying.
const isPermanent = (error) => !!error?.permanent;

/**
 * Try to send everything queued, oldest first.
 *
 * Safe to call at any time and from anywhere — concurrent calls collapse into
 * one. Never throws: results are reported through the queue itself.
 *
 * Returns { sent, pending, failed }.
 */
export const flushQueue = async () => {
  if (flushing) return { sent: 0, pending: null, failed: 0, skipped: true };
  flushing = true;

  let sent = 0;
  let failed = 0;

  try {
    // Re-read on each pass: a punch may have been enqueued while we were busy.
    let queue = await readQueue();
    const targets = queue.filter((p) => !p.failed);

    for (const item of targets) {
      try {
        await sendCheckin(item.employeeId, item.logType, {
          photoUri: item.photoUri,
          location: item.location,
          notes:    item.notes,
          time:     item.time,
        });
        queue = (await readQueue()).filter((p) => p.id !== item.id);
        await writeQueue(queue);
        sent += 1;
      } catch (error) {
        const attempts = item.attempts + 1;
        const permanent = isPermanent(error) || attempts >= MAX_ATTEMPTS;

        queue = (await readQueue()).map((p) => (
          p.id === item.id
            ? {
                ...p,
                attempts,
                failed: permanent,
                lastError: error?.message || 'Could not sync this punch.',
              }
            : p
        ));
        await writeQueue(queue);
        if (permanent) failed += 1;

        // A transient failure means the network is down for everything that
        // follows too — stop rather than burning attempts on the whole queue.
        if (!permanent) break;
      }
    }

    const remaining = (await readQueue()).filter((p) => !p.failed).length;
    return { sent, pending: remaining, failed };
  } finally {
    flushing = false;
  }
};
