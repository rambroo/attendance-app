# Free Hosting for Testing (Android)

This app can be tested for free in two ways. Both use Expo's free tier (EAS) — no credit card, no Apple Developer account, no Play Store fee.

Pick **Path A** for fastest iteration during development. Pick **Path B** when you need a real installable APK that testers can keep using without your machine running.

The backend URL is **not baked into the build** — testers enter the Frappe site URL on first launch (the `SiteSetupScreen`), so the same APK works against any Frappe site.

---

## One-time setup

```bash
# 1. Install the EAS CLI globally
npm install -g eas-cli

# 2. Log into the Expo account you already have
eas login

# 3. From the project root, link this project to your Expo account
#    This will add `extra.eas.projectId` to app.json automatically.
cd R:\TechNiti\apps\attendance-app
eas init
```

That's it for setup. You won't need to repeat any of this.

---

## Path A — Expo Go + tunnel (fastest, free, dev-only)

**Use when:** You're actively developing and want testers to see changes live without rebuilding.

**Trade-off:** Your dev machine has to be running while testers use the app, and they need the free **Expo Go** app from the Play Store.

```bash
npm run start:tunnel
# or equivalently: npx expo start --tunnel
```

A QR code prints in the terminal. Testers:

1. Install **Expo Go** from the Play Store (free).
2. Open Expo Go → tap **Scan QR code** → scan the QR.
3. The app loads. Every code change you save reloads on their phone.

Tunneling is needed when testers are **not** on the same Wi-Fi as you. Expo's free tunnel uses ngrok under the hood — no extra setup.

---

## Path B — Standalone APK (recommended for actual testing) ★

**Use when:** You want testers to install the app once and use it on their own time, even when your machine is off.

**Trade-off:** ~10–20 minute build per release, free tier has a build queue.

### Build the APK

```bash
npm run build:preview
# or: eas build --profile preview --platform android
```

What happens:

1. EAS uploads your project to Expo's build servers.
2. They build a signed `release.apk` on the cloud (managed credentials — they generate and store a keystore for you).
3. When done, you get a URL like `https://expo.dev/artifacts/eas/xxx.apk`.

### Share with testers

Three free ways to distribute the APK:

| Method | How |
|---|---|
| **Direct Expo link** | Just copy the build URL from `eas build` output and send it. Testers open it in their phone browser and tap to install. The link is public but unguessable. |
| **Expo internal distribution page** | Run `eas build:list` or open `https://expo.dev/accounts/<you>/projects/attendance-app/builds` — every build has its own page with a QR + install link. |
| **Your own host** | Download the APK once, drop it into Google Drive / Dropbox / GitHub Releases, share the link. |

### What testers do on their phone

1. Open the install link in Chrome.
2. Tap to download the `.apk`.
3. Android will warn about "unknown sources" — they tap **Settings → Allow from this source** once, then **Install**.
4. Open the app → enter your Frappe site URL on the first screen → log in.

### Rebuilding after code changes

Just run `npm run build:preview` again. Testers re-download the new APK from the new link (or you can use `eas update` later to push JS-only changes without a full rebuild — see "Optional upgrades" below).

---

## Free-tier limits (as of 2026)

- **Builds:** 30 free Android builds/month on the free Expo plan, queued (priority is paid).
- **EAS Update:** Generous free tier for OTA JS bundle updates if you add `expo-updates` later.
- **Bandwidth on APK downloads from Expo:** unmetered for normal testing volumes.

If you hit the build cap, you can also `eas build --local` to build on your own machine for free (requires Android SDK + JDK installed).

---

## Optional upgrades (not needed for first round of testing)

- **OTA updates** — Install `expo-updates`, run `eas update --channel preview --message "fix typo"`. Testers' existing APKs pull the new JS bundle on next launch. Much faster than rebuilding.
- **Internal testing on Play Console** — Free if you have a Google Play Developer account ($25 one-time). Easier install for non-technical testers than sideloading an APK.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `eas: command not found` | Run `npm install -g eas-cli` again, make sure your global npm bin is on PATH. |
| Build fails on Android keystore | Let EAS manage it: when prompted "Generate a new Android Keystore?", answer **yes**. |
| Tester sees "App not installed" | Older APK with the same package name was installed first. Uninstall it (`com.techniti.attendance`) and retry. |
| Tester can't reach Frappe site | The site URL they enter must be reachable from their phone's network (4G included). If you're using a local WSL site, expose it via a Cloudflare Tunnel first. |
| Punch fails with "Network request failed" | Same as above — Frappe site not reachable from the phone. |

---

## Quick reference

```bash
# Fast dev testing (your machine must be on):
npm run start:tunnel

# Build a real APK testers can install:
npm run build:preview

# See all your past builds + install links:
eas build:list
```
