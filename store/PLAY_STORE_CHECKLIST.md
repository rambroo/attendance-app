# Play Store Launch Checklist — TechNiti Attendance

Everything needed to pass Google Play review on the first submission. Code-level items are already done in v1.1.0 (see "What was fixed" at the bottom). The items below are actions **you** must do in Play Console.

---

## 0. FIRST: check your developer account type

**Play Console → Settings → Developer account → Account details → Account type.**

| If it says | Then |
|---|---|
| **Organization** | No extra gate. Internal testing → Production directly. |
| **Personal / Individual** | ⚠️ Google requires a **closed test with 12+ testers opted in for 14 continuous days** before you can apply for production access. Drop below 12 and the clock restarts. Use the **Closed testing** track (Internal testing does NOT count toward the 14 days). Recruiting 12 testers becomes the critical path — start it before anything else. |

---

## Dashboard walkthrough — "Set up your app", in order

| # | Task | Answer |
|---|---|---|
| 1 | Privacy policy | `https://rambroo.github.io/attendance-app/` |
| 2 | App access | Restricted → demo credentials + instructions (§4 below) |
| 3 | Ads | **No**, contains no ads |
| 4 | Content rating | Utility/Productivity → No to all → "Everyone" |
| 5 | Target audience | **18 and over only** — nothing under 18 |
| 6 | News / Government / Financial / Health | No / No / None / No |
| 7 | Data safety | See §3 below |
| 8 | Category & contact | **Business**, rohanrambhiya59@gmail.com |
| 9 | Store listing | Copy from `store/STORE_LISTING.md` + icon, feature graphic, screenshots |

Then: **Create release → upload `.aab` → roll out to testers → smoke test (§11) → promote to Production.**

---

## 1. Build & upload

```bash
npm run build:prod        # eas build --profile production --platform android → .aab
```

- EAS manages the upload keystore. In Play Console you'll use **Play App Signing** (default) — accept it when creating the app.
- `autoIncrement: true` in eas.json bumps `versionCode` automatically each production build.
- App version is **1.1.0** — do NOT publish OTA updates built from this code to the old `preview` channel binaries (they lack the new `expo-secure-store` native module; the runtimeVersion bump to 1.1.0 protects store/production users automatically).

## 2. Privacy policy (mandatory — camera + precise location)

- ✅ Contact email filled in (rohanrambhiya59@gmail.com).
- ✅ HTML version lives at `docs/index.html` — enable GitHub Pages once: **repo Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder `/docs` → Save.** URL becomes `https://rambroo.github.io/attendance-app/`.
- Enter that URL in **Play Console → App content → Privacy policy**.

## 3. Data safety form (App content → Data safety)

Declare exactly this:

| Question | Answer |
|---|---|
| Does your app collect or share user data? | **Yes** |
| **Location → Precise location** | Collected, not shared. Purpose: App functionality. Required. Not processed ephemerally. |
| **Photos → Photos** | Collected, not shared. Purpose: App functionality. Required. |
| **Personal info → Name, Email address** | Collected, not shared. Purpose: App functionality, Account management. Required. |
| **Personal info → User IDs** (employee ID) | Collected, not shared. Purpose: App functionality. |
| Is all user data encrypted in transit? | **Yes** (if all your production sites use HTTPS — see note below) |
| Do you provide a way for users to request deletion? | **Yes** — via HR administrator (describe: "Data is stored on the employer's own server; deletion requests are handled by the employer's HR admin per the privacy policy.") |

> ⚠️ **HTTPS note:** the app technically allows `http://` site URLs (for LAN/self-hosted setups). If your production deployment uses HTTPS sites only, answering "Yes" to encryption in transit is accurate for your users. Keep production sites on HTTPS.

## 4. App access (critical for apps behind a login — #1 rejection cause)

Google reviewers **must be able to log in**. In **App content → App access** → "All or some functionality is restricted".

- **Instructions name:** Employee login (demo account)
- **Username / Password:** the demo employee account on `techniti.wecanwewillfdn.org`
  (credentials live in Play Console only — never commit them to this public repo)
- **Other information:**

  > This app connects to an organization's own Frappe/ERPNext HR server.
  >
  > 1. On the first screen, enter this site address: `techniti.wecanwewillfdn.org` and tap Connect.
  > 2. Log in with the email and password above.
  > 3. Allow camera and location permissions when prompted (required to record a punch).
  >
  > Note: when you tap Punch In, the server validates your GPS position against a geofence around our office in Mumbai, India. Punching from outside that area is rejected by the server with a location message — this is expected behavior and demonstrates the geofence validation. All other features (attendance history, calendar, profile) work normally.

- ✅ Site verified reachable over HTTPS (`/api/method/ping` → `pong`).
- The demo account must stay working for the whole review period **and all future update reviews** — don't disable it after approval.
- Confirm the demo user has a **linked Employee record**, otherwise login succeeds but the profile never loads and the app looks broken to a reviewer.

## 5. Content rating questionnaire

- Category: Utility/Productivity. No violence/sex/etc. → will get "Everyone".

## 6. Target audience

- 18+ only (workplace app). Do **not** select any age group under 18 — avoids Families policy requirements.

## 7. Permissions declarations

- **Camera, Fine location**: no special declaration form needed (they're not in the sensitive-permissions list requiring one), but the listing description should mention why they're used — e.g. "Requires camera (selfie verification) and location (geofenced attendance) at the moment of punch."
- The app requests **no background location** — do not answer yes to background location questions.
- RECORD_AUDIO is explicitly blocked in the manifest (v1.1.0).

## 8. Store listing assets (create these)

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG | ✅ `store/assets/play-icon-512.png` |
| Feature graphic | 1024×500 PNG (required) | ✅ `store/assets/feature-graphic-1024x500.png` |
| Phone screenshots | Min 2, ideally 4–8, 16:9 or 9:16 (site setup, login, home/punch, camera, history calendar) | ❌ take on device |
| Short description | ≤80 chars | ✅ see `store/STORE_LISTING.md` |
| Full description | ≤4000 chars | ✅ see `store/STORE_LISTING.md` |

Screenshot tip: use a demo site with fake employee data — no real employee names/photos in screenshots.

## 9. App category & contact

- Category: **Business** (or Productivity).
- Support email is public — use a team address.

## 10. Pre-launch report expectations

Play's automated pre-launch tests run on real devices with no site configured — they'll only see the Site Setup screen and can't proceed. That's normal and won't block release, but check the report for crashes anyway.

## 11. Before you press Publish — final smoke test

Build a production `.aab`, then test the identical code path locally (`eas build --profile preview` APK, or download the universal APK from the AAB build page) on a real device:

1. Fresh install → Site setup with **https** site → login → punch in (camera + GPS permission prompts show custom strings).
2. Punch with GPS off → retry/timeout flow appears (no infinite "Acquiring GPS…").
3. Airplane mode after login → app opens with cached data + offline badge.
4. Kiosk mode: setup, punch by ID, admin PIN exit.
5. Logout → credentials gone (relaunch shows login, not auto-login).

---

## What was fixed in code for this release (v1.1.0)

1. **Proguard/resource shrinking actually enabled** — the old `android.enableProguardInReleaseBuilds` key in app.json was invalid and silently ignored; now configured via `expo-build-properties`.
2. **RECORD_AUDIO permission removed** (`recordAudioAndroid: false` + `blockedPermissions`) — was being added by expo-camera by default.
3. **Credentials moved to encrypted SecureStore** (Android Keystore): saved login password and kiosk API key are no longer in plaintext AsyncStorage. Existing installs migrate automatically on first read.
4. **`allowBackup` disabled** — app data (sessions/credentials) excluded from device backups.
5. **Cleartext HTTP enabled deliberately** (`usesCleartextTraffic: true`) so self-hosted `http://` LAN sites keep working in release builds — matching what the Site Setup screen advertises.
6. **GPS hang fixed** — `getCurrentPositionAsync` was given an unsupported `timeout` option and could hang forever; now raced against a real 12s timeout with fallback to a ≤60s-old last-known position, then the existing retry UI.
7. **Upload/network hangs fixed** — selfie upload (employee + kiosk) and all kiosk API calls now abort after 20–45s with a friendly error instead of spinning forever.
8. **Global error boundary** — unexpected JS errors show a "Reload" screen instead of hard-crashing (protects Play vitals / crash rate).
9. **`btoa` replaced with the `base-64` package** in kiosk setup (Hermes-safe, consistent with the rest of the app).
10. **Selfie no longer captured with `base64: true`** — saves ~1–2 MB of memory per punch (base64 copy was never used).
11. **`console.*` stripped from production bundles** via babel `transform-remove-console`.
12. **Version bumped to 1.1.0** so old preview binaries (without expo-secure-store) never receive an incompatible OTA update (runtimeVersion policy = appVersion).
