import * as Updates from 'expo-updates';

// A small marker shown in the app, so you can check on a phone which version of
// the app's code is actually running after publishing an update.
//
// Bump APP_BUILD_LABEL by hand for each release you want to recognise
// (v1 → v2 → v3 …). The date after it comes from expo-updates and never needs
// bumping: it is the moment the running update was published. So even if the
// label is forgotten, a new date on the phone still proves a new update arrived.
export const APP_BUILD_LABEL = 'v1';

const formatPublished = (date) => {
  try {
    return date.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch {
    return '';
  }
};

// Examples:
//   "v1 · updated 11 Sep, 2:05 pm"  running an update published over the air
//   "v1 · store build"              running the code built into the Play Store app
//   "v1 · dev"                      running from `npx expo start`
export const getBuildTag = () => {
  try {
    if (!Updates.isEnabled) return `${APP_BUILD_LABEL} · dev`;
    if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `${APP_BUILD_LABEL} · store build`;
    const when = formatPublished(new Date(Updates.createdAt));
    return when ? `${APP_BUILD_LABEL} · updated ${when}` : APP_BUILD_LABEL;
  } catch {
    return APP_BUILD_LABEL;
  }
};
