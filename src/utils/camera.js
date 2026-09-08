// Selfie capture sizing.
//
// By default CameraView captures at the sensor's full resolution — on a modern
// front camera that is an 8–16 MP frame, and even at quality 0.5 the resulting
// JPEG is 1.5–3 MB. Uploading that over a weak mobile uplink is what made
// "Confirm Punch" take 15–30 seconds.
//
// A punch selfie only has to be good enough to recognise a face, so we cap the
// capture at roughly 720 px on the long edge. That is ~20x smaller on the wire
// and still leaves a face around 200 px tall at arm's length, which is
// comfortably above what the server-side face matcher needs.
//
// This uses expo-camera's existing `pictureSize` prop rather than resizing
// after the fact, so it needs no new native module and ships as an OTA update.

/** Long edge, in pixels, we aim for when capturing a punch selfie. */
export const TARGET_LONG_EDGE = 720;

/** JPEG quality. Higher than before on purpose — at 720 px the file is tiny
 *  either way, and less compression artefacting helps face matching. */
export const CAPTURE_QUALITY = 0.7;

/**
 * Choose the smallest camera picture size that still meets TARGET_LONG_EDGE.
 *
 * `sizes` comes from CameraView.getAvailablePictureSizesAsync(). Android
 * returns "WIDTHxHEIGHT" strings; iOS returns AVCaptureSessionPreset names,
 * some of which embed dimensions ("hd1280x720", "vga640x480") and some of
 * which do not ("photo", "high", "medium").
 *
 * Returns undefined when nothing usable is found, which leaves the camera on
 * its default — degraded, but never broken.
 */
export const pickPictureSize = (sizes, targetLongEdge = TARGET_LONG_EDGE) => {
  if (!Array.isArray(sizes) || sizes.length === 0) return undefined;

  const measured = [];
  for (const size of sizes) {
    const match = /(\d+)\s*[xX×]\s*(\d+)/.exec(String(size));
    if (!match) continue;
    const longEdge = Math.max(Number(match[1]), Number(match[2]));
    if (longEdge > 0) measured.push({ size, longEdge });
  }

  if (measured.length === 0) {
    // No dimensions to compare (iOS preset names only). "medium" is the
    // smallest preset that is still reliably present across devices.
    return sizes.find((s) => String(s).toLowerCase() === 'medium');
  }

  measured.sort((a, b) => a.longEdge - b.longEdge);

  // Smallest option that still clears the target, else the largest we have.
  const good = measured.find((m) => m.longEdge >= targetLongEdge);
  return (good || measured[measured.length - 1]).size;
};
