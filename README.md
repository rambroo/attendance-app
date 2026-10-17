# Next Attendance — mobile app

An Android attendance app for [Frappe HR](https://frappe.io/hr) / ERPNext. Employees punch in and out with a **selfie and their GPS location**; a **kiosk mode** lets a shared tablet record attendance for students or visitors by ID number.

Built with React Native and [Expo](https://expo.dev) (SDK 54). It works with any Frappe site — users enter their site address on first launch.

> **This app needs its backend.** Install the [`next_attendance`](https://github.com/rambroo/next-attendance) Frappe app on your site first. It provides the punch API, the custom fields, the kiosk endpoints and the selfie privacy layer.

## Features

- **Punch in / out** with a front-camera selfie and GPS location
- **Works offline** — punches are saved on the phone and sent when the connection returns, keeping the time they were taken
- **Kiosk mode** — a fixed tablet where students or visitors enter their ID number and take a selfie
- **Attendance calendar**, leave balances and applications, salary slips, and shifts (from Frappe HR)
- **Private selfies** — photos are uploaded as private files and shown through short-lived signed links
- **Three themes** — Daylight, Midnight and Onyx
- **Over-the-air updates** through EAS Update

## Requirements

| | |
|---|---|
| Frappe / Frappe HR site | v15 or v16, with HTTPS |
| Backend app | [`next_attendance`](https://github.com/rambroo/next-attendance) installed on that site |
| Node.js | 20 or newer |
| Phone for testing | Android 7 or newer, with [Expo Go](https://expo.dev/go) **for SDK 54** |
| Builds | A free [Expo](https://expo.dev) account (for EAS Build) |

## 1. Set up the backend

Follow the [`next_attendance` README](https://github.com/rambroo/next-attendance#readme). In short:

```bash
bench get-app https://github.com/rambroo/next-attendance
bench --site your-site install-app next_attendance
```

Then, on your site:

1. **Link each employee to their user** (Employee → User ID), and keep "Create User Permission" on, so employees can only punch for themselves.
2. **For kiosk mode**, create a dedicated user with only the **Kiosk User** role and generate an API key for it. Don't use a staff member's account — the key is stored on a shared tablet.

## 2. Run the app locally

```bash
git clone https://github.com/rambroo/attendance-app.git
cd attendance-app
npm install
npx expo start
```

Scan the QR code with **Expo Go (SDK 54)** on an Android phone on the same Wi-Fi. If your network blocks that, use `npm run start:tunnel`.

On first launch, enter your site address (e.g. `https://your-site.example.com`) and sign in with an employee account.

> **Expo Go only runs one SDK version.** The Play Store version of Expo Go may be newer than SDK 54. Download Expo Go for SDK 54 from the [Expo Go releases](https://github.com/expo/expo-go-releases/releases) and turn off its auto-update.

Plain `http://` addresses are only accepted for local-network servers (e.g. `http://192.168.1.10:8000` for a development bench). Anything on the internet must use `https://`.

## 3. Build your own app

The repo is configured for the original publisher. Before building, change these in `app.json` to your own:

| Field | Why |
|---|---|
| `expo.owner` | Your Expo account |
| `expo.extra.eas.projectId` and `expo.updates.url` | Run `npx eas init` to create your own project; it fills these in |
| `expo.android.package` / `expo.ios.bundleIdentifier` | Must be unique to you on the Play Store |
| `expo.name`, icons in `assets/` | Your branding |

Then:

```bash
npx eas login
npx eas build --platform android --profile preview      # an APK to install directly
npx eas build --platform android --profile production   # an .aab for the Play Store
```

### Releasing updates

JavaScript-only changes can go out over the air, without a new Play Store build:

```bash
npx eas update --branch production --message "What changed"
```

Phones receive an update on their second app launch after it is published.

- **Keep `expo.version` the same** (e.g. `1.1.0`) between store builds that should receive the same updates — updates only reach builds with a matching runtime version.
- **A new store build is needed** for native changes: new native packages, permissions, the icon or the splash screen.
- **Roll back** a bad update with `npx eas update:roll-back-to-embedded --branch production --platform android --message "Roll back"`.

## Kiosk mode

On the login screen, tap **Switch to Kiosk Mode** and enter:

- the kiosk user's API key and secret, as `apiKey:apiSecret`
- a location name (e.g. "Main Gate")
- a 4-digit admin PIN for leaving kiosk mode (obvious PINs like `0000` or `1234` are refused)

The API key and PIN are stored in the phone's encrypted storage (Android Keystore).

## Project structure

```
App.js                 App state machine: site setup → login → main tabs / kiosk
src/api/               Calls to the Frappe REST API (auth, attendance, leave, payroll, shifts, kiosk)
src/components/        PunchModal (camera + preview), ThemePicker
src/screens/           One file per screen
src/utils/             Themes, offline punch queue, location tracking, secure storage, site config
.github/workflows/     CI: publishes OTA updates
store/                 Play Store listing text and privacy policy
docs/                  Privacy policy page (GitHub Pages)
```

[`DOCS.md`](DOCS.md) has a longer walkthrough of how each part works.

## Security notes

- Saved passwords and the kiosk API key are kept in the Android Keystore, not plain storage. App data is excluded from device backups.
- Release builds strip all console logging.
- Selfies are private on sites running `next_attendance`, and are only served through signed links that expire after 15 minutes.
- The app sends the punch time and GPS position from the phone. The backend rejects punch times in the future or older than 48 hours; GPS can still be spoofed on a rooted phone, so treat it as a deterrent rather than proof.

Found a security issue? Please email the maintainer instead of opening a public issue.

## Contributing

Pull requests are welcome. Please open them against the **`develop`** branch, not `main`; `main` is what gets released.

Before opening a PR:

```bash
npx expo export --platform android   # must build without errors
```

Keep every React hook above any early `return` in a component. A hook after an early return crashes the screen on its second render, and has done so in production before.
