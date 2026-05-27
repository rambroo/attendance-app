# TechNiti Attendance App — Complete Documentation

This document explains every part of the app: what it does, why it was built that way, how to deploy it, and how to keep it updated.

---

## Table of Contents

1. [What the App Does](#1-what-the-app-does)
2. [Technology Choices](#2-technology-choices)
3. [How the App is Structured](#3-how-the-app-is-structured)
4. [How Each File Works](#4-how-each-file-works)
5. [The Frappe Backend](#5-the-frappe-backend)
6. [Deployment — Step by Step](#6-deployment--step-by-step)
7. [Updating the App (OTA Updates)](#7-updating-the-app-ota-updates)
8. [Building a New APK](#8-building-a-new-apk)
9. [APK Size Explained](#9-apk-size-explained)
10. [Key Design Decisions](#10-key-design-decisions)
11. [Known Constraints](#11-known-constraints)

---

## 1. What the App Does

The **TechNiti Attendance App** is a mobile app for employees to record their attendance by:

1. Taking a **selfie** to prove they are physically present
2. Capturing their **GPS location** to verify they are at the office
3. Recording the **exact time** of their punch-in or punch-out

Every punch is validated server-side against a 50-metre geofence around the registered office locations. If an employee is outside the allowed area, the punch is rejected.

**Key features:**
- Punch In / Punch Out with selfie + GPS
- Today's punch timeline (what time they clocked in/out)
- Monthly attendance calendar (colour-coded by day status)
- Day-detail view (tap a date → see selfie, punch times, map link)
- Works offline using cached data when no internet
- Stays logged in automatically (no re-entering password)
- Updates itself silently — no need to reinstall the app

---

## 2. Technology Choices

| Technology | What it is | Why we chose it |
|---|---|---|
| **React Native** | JavaScript framework for Android + iOS apps | One codebase works on both platforms. 90% of code is shared. |
| **Expo** | Toolset on top of React Native | Handles all the complex native setup automatically. Camera, GPS, splash screen — all work out of the box. |
| **Expo EAS Build** | Cloud build service | Builds the APK on Expo's servers — no Android Studio needed on your computer. |
| **Expo EAS Update (OTA)** | Over-the-air update system | Push code changes via `git push` — installed apps update automatically. No re-installing needed. |
| **Frappe/ERPNext** | Backend system | Already in use at TechNiti. Employee records, attendance, leave management all live here. |
| **AsyncStorage** | Device key-value storage | Stores the site URL, session, employee data locally on the phone. Used for caching and staying logged in. |

---

## 3. How the App is Structured

```
attendance-app/
├── App.js                    ← App entry point. Controls which screen shows (Site Setup / Login / Main)
├── index.js                  ← Registers the app with Expo
├── app.json                  ← App configuration (name, permissions, bundle ID, OTA URL)
├── eas.json                  ← Build configuration (APK vs AAB, channels, Proguard)
├── .github/
│   └── workflows/
│       └── update.yml        ← GitHub Action: auto-publish OTA update on every git push
├── src/
│   ├── api/
│   │   ├── apiClient.js      ← Axios HTTP client (auth headers, dynamic site URL)
│   │   ├── authApi.js        ← Login, logout, silent re-login
│   │   └── attendanceApi.js  ← All attendance data: checkins, history, month calendar
│   ├── components/
│   │   └── PunchModal.js     ← Camera + GPS capture modal (selfie + location)
│   ├── screens/
│   │   ├── SiteSetupScreen.js ← First-launch: enter Frappe site URL
│   │   ├── LoginScreen.js    ← Email + password login
│   │   ├── HomeScreen.js     ← Punch In/Out dashboard
│   │   └── HistoryScreen.js  ← Monthly calendar view + day detail modal
│   └── utils/
│       ├── theme.js          ← All colours in one place (design tokens)
│       ├── siteConfig.js     ← Save/load the Frappe site URL
│       └── constants.js      ← Legacy file (not used — replaced by siteConfig.js)
└── assets/                   ← App icon, splash screen
```

---

## 4. How Each File Works

### `App.js` — The Traffic Controller

This is the first thing that runs. It decides which screen to show based on three yes/no questions:

```
Is a Frappe site configured?
  No  → show SiteSetupScreen (first time setup)
  Yes → Is the user logged in?
          No  → show LoginScreen
          Yes → show the main app (Home + History tabs)
```

It also handles **silent re-login**: if the Frappe session expires (server restarts, 6-hour timeout), the app automatically logs back in using the saved email and password. The user never sees the login screen again after the first time.

---

### `src/api/apiClient.js` — The HTTP Client

All API calls to Frappe go through this one file. It uses **Axios** (a network library).

**Why it exists:** In a normal app, the server URL is hardcoded. But this app supports any Frappe site — so the URL is stored on the device and read before every request.

Every request automatically:
1. Reads the site URL from device storage
2. Attaches the auth token (either an API key or a session cookie)

If the server returns `503 SessionStopped` (Frappe's way of saying "your login expired"), the client clears the saved session so the app can trigger a fresh login.

---

### `src/api/authApi.js` — Login and Session Management

Handles everything related to who is logged in.

**`loginWithPassword(email, password)`**
- Calls Frappe's `/api/method/login`
- On success: saves the session ID (`sid`) and also saves the email + password for silent re-login later

**`silentReLogin()`**
- Called automatically on app startup and when a session expires
- Reads the saved email + password and calls `loginWithPassword` again silently
- Returns `true` if it worked, `false` if credentials are wrong or missing
- This is why employees don't see the login screen every day

**`logout()`**
- Calls Frappe's logout endpoint to end the server session
- Clears all saved credentials from the device

---

### `src/api/attendanceApi.js` — All Attendance Data

The largest API file. Contains all functions that talk to Frappe's attendance system.

**Key functions:**

| Function | What it does |
|---|---|
| `getTodayCheckins(employeeId, date)` | Gets today's punch records from `Employee Checkin` doctype |
| `getMonthAttendance(employeeId, year, month)` | Gets official `Attendance` records for a calendar month |
| `getMonthCheckins(employeeId, year, month)` | Gets raw punch records grouped by date (used when official Attendance doesn't exist yet) |
| `getDateCheckins(employeeId, dateStr)` | Full details for one day — includes selfie URL, GPS, geofence status |
| `createCheckin(employeeId, logType, options)` | Records a punch — uploads selfie first, then calls the Server Script |
| `uploadSelfieGetUrl(photo)` | Uploads the selfie photo to Frappe and returns the public file URL |
| `getEmployeeByEmail(email)` | Looks up the employee record linked to the logged-in user |
| `calcWorkingHours(checkins)` | Calculates worked hours from a list of IN/OUT punches |

**Why two separate data sources (Attendance + Employee Checkin)?**

Frappe has two separate doctypes:
- `Employee Checkin` — created immediately when someone punches in/out via the app
- `Attendance` — created later by a Frappe background job ("Auto Attendance") that processes the check-ins

The app reads from **both** and combines them:
- If an official `Attendance` record exists → use that (most accurate)
- If only `Employee Checkin` exists → show as "Checked In" (punch was recorded, not yet processed)
- If neither → show as Absent

**Caching (offline support):**
Every API response is saved to `AsyncStorage`. If the network fails, the app shows the last saved data instead of an error screen.

---

### `src/components/PunchModal.js` — The Selfie + Location Capture

A full-screen modal that appears when the employee taps the punch button. It runs two things in parallel:

1. **Camera** — opens the front-facing camera for a selfie
2. **GPS** — starts fetching the device location in the background

The employee sees the camera live view, positions their face in the oval guide, and taps the shutter button. On the preview screen, they can see:
- Their selfie
- Their GPS location (or an error if GPS failed)
- Confirm button (disabled if GPS hasn't arrived yet)

**Why GPS is mandatory:** The Frappe server script rejects any punch without coordinates when geolocation tracking is enabled. If GPS fails, the employee sees a Retry button (up to 3 attempts). They can force-punch without GPS, but the server will reject it.

**Why selfie is mandatory:** The `Employee Checkin Geofence & Selfie Validation` server script checks for `custom_selfie_image` before saving — if empty, it throws an error. There is no skip option.

**Why selfies are uploaded as public files:** Android's networking library (OkHttp) strips authentication Cookie headers from `Image` component requests. Private files require a Cookie header to access. Making selfies public means the image URL works directly in the app without auth tricks.

---

### `src/screens/HomeScreen.js` — The Punch Dashboard

The main screen employees see every day. Shows:
- A live clock (isolated in its own component so the 1-second tick doesn't re-render the whole screen)
- Current status (Checked In / Checked Out / Not checked in)
- Today's punch timeline
- The big Punch In/Out button
- Stats: first check-in time, total hours, last check-out time

**Stale-while-revalidate:** On load, it immediately shows cached data from yesterday so the screen appears instant. Then it fetches fresh data from Frappe in the background and updates quietly.

---

### `src/screens/HistoryScreen.js` — The Monthly Calendar

Shows a 7-column calendar grid (Sun–Sat) for the selected month. Each day is a colour-coded tile:

| Colour | Meaning |
|---|---|
| Green | Present (official Attendance record) |
| Red | Absent (no record found for that past day) |
| Amber | Half Day |
| Purple | On Leave |
| Light green | Checked In (punched but Attendance not generated yet) |
| Grey | Future date |

**Tap a day** → bottom sheet modal appears with:
- Selfie photo
- Punch In and Punch Out times
- Working hours
- Geofence status (Within Range / Outside Range)
- "Open in Google Maps" button with exact coordinates

**Summary counts** are calculated from the combined data — not just from official Attendance records. So even before HR processes any records, the counts show the correct numbers based on actual punches.

---

### `src/utils/theme.js` — All Colours

Every colour in the app is defined here as a single `C` object:

```js
C.brand    = '#3CC88F'   // Signature emerald green — buttons, active states
C.primary  = '#1A6B47'   // Deep green — headers, status bars
C.in       = '#3CC88F'   // Punch In colour (green)
C.out      = '#E53935'   // Punch Out colour (red)
```

**Why this matters:** Changing the brand colour means editing one line in one file. Nothing is hardcoded anywhere else.

---

## 5. The Frappe Backend

### Custom Fields (must exist on Employee Checkin doctype)

| Field | Type | Purpose |
|---|---|---|
| `custom_selfie_image` | Attach | URL of the selfie photo |
| `custom_geofence_status` | Data | "Within Range" or "Outside Range" |
| `custom_matched_location` | Data | Name of the matched location |
| `custom_distance_meters` | Float | Distance from office in metres |

**How to add them:** Frappe desk → Customize Form → Employee Checkin → Add Field

---

### Server Script 1: `attendance_app_punch` (API type)

**URL:** `/api/method/attendance_app_punch`  
**Called by:** The app when an employee punches in or out

**What it does:**
1. Receives employee ID, log type (IN/OUT), time, GPS coordinates, and selfie file URL
2. Creates an `Employee Checkin` document in Frappe
3. Sets `custom_selfie_image` so the validation script finds it

**Why a Server Script instead of the standard REST API:**
The `Employee Checkin Geofence & Selfie Validation` script runs *before* the checkin is saved. When the app used the standard REST API to create the checkin, the selfie hadn't been uploaded yet at that point. The Server Script receives everything in one call — selfie URL, GPS, time — and creates the checkin with all fields already set.

---

### Server Script 2: `Employee Checkin Geofence & Selfie Validation` (Before Save)

Runs automatically every time any Employee Checkin is saved.

**What it validates (in order):**
1. `custom_selfie_image` must not be empty — rejects with "Selfie is mandatory"
2. `latitude` and `longitude` must be present — rejects with "GPS location is required"
3. Employee must be within 50 metres of a registered location — rejects with the exact distance

**Hardcoded office locations (update these for a new site):**
```python
locations = [
    {"name": "WCWW Office",   "lat": 19.217239, "lng": 72.824614, "radius": 50},
    {"name": "Old Age Home",  "lat": 19.216538, "lng": 72.824635, "radius": 50},
]
```

---

### Server Script 3: `File before Insert` (DocType Event — Before Insert on File)

**Scoped to Expense Form attachments only.** Makes those files public so they can be viewed in the browser without login. 

> **Important:** This script must NEVER apply to all files — it will break selfie uploads by rewriting private file URLs before they are written to disk.

---

### HR Settings

In Frappe → HR Settings → Attendance:
- **Allow Geolocation Tracking** must be `✓ Enabled`

Without this, the GPS validation in the server script is skipped entirely.

---

## 6. Deployment — Step by Step

### Prerequisites
- Node.js 18+ installed
- Expo account at [expo.dev](https://expo.dev) (account: `rambroo`)
- EAS CLI: `npm install -g eas-cli`

### First-time setup on a new computer

```bash
# 1. Clone the repo
git clone https://github.com/rambroo/attendance-app.git
cd attendance-app

# 2. Install dependencies
npm install

# 3. Log into Expo
eas-cli login
# Username: rambroo  |  Email: rohanrambhiya59@gmail.com

# 4. Verify the project is linked
eas-cli project:info
# Should show: @rambroo/attendance-app
```

### Run for development (Expo Go on phone)

```bash
npx expo start
# Scan the QR code in the Expo Go app on Android/iOS
# The app will load — connect to any Frappe site at runtime
```

### Build a new APK (when native code changes)

Only needed when you add new packages that contain native code, change permissions, or change the app icon.

```bash
eas build --profile preview --platform android
# Takes 10-15 minutes on Expo's cloud servers
# Download link appears when done
```

**When to build a new APK vs just push an OTA update:**

| Change | Build new APK? |
|---|---|
| UI changes (screens, styles) | No — OTA push is enough |
| Bug fixes in JS code | No — OTA push is enough |
| New screen or feature (pure JS) | No — OTA push is enough |
| New `npm install` package with native code | **Yes** |
| Changing permissions in app.json | **Yes** |
| Changing app icon or splash | **Yes** |
| Changing bundle ID | **Yes** |

---

## 7. Updating the App (OTA Updates)

OTA (Over The Air) updates push new JavaScript code to already-installed apps without requiring a reinstall.

### How it works

```
You push code to GitHub (git push origin main)
        ↓
GitHub Actions automatically runs (.github/workflows/update.yml)
        ↓
EAS Update publishes new JS bundle to Expo's CDN
        ↓
When employees open the app → it checks for updates in background
        ↓
Next time they open the app → new code is running
```

### To push an update

```bash
# Make your code changes, then:
git add .
git commit -m "describe what you changed"
git push origin main

# GitHub Action handles the rest automatically (~2 minutes)
```

### To check if the update was published

```bash
eas-cli update:list --branch preview --limit 5
```

### GitHub Secret required

The GitHub Action needs permission to publish to Expo. This is set in:
`GitHub → repository Settings → Secrets → EXPO_TOKEN`

If the Action fails with an auth error, regenerate the token at [expo.dev/accounts/rambroo/settings/access-tokens](https://expo.dev/accounts/rambroo/settings/access-tokens) and update the secret.

---

## 8. Building a New APK

```bash
# Build for internal sharing (APK file, direct install)
eas build --profile preview --platform android

# The build runs on Expo's cloud — no Android Studio needed
# Download link is emailed + shown in terminal
# Also visible at: expo.dev/accounts/rambroo/projects/attendance-app/builds
```

**Share the APK:** The download link from Expo is direct — share it with employees. They tap it on their phone, allow "Install from unknown sources", and the app installs.

---

## 9. APK Size Explained

The APK is large (~80-120MB after optimisations) because:

1. **Multiple CPU architectures** — The APK must work on every Android phone. Different phones use different chips (ARM64, ARMv7, x86). Each architecture needs its own copy of the native code.

2. **Expo SDK** — Expo includes a large runtime that powers camera, GPS, file system, and many other features. This is necessary but adds size.

3. **Hermes engine** — React Native uses Google's Hermes JavaScript engine, which is compiled into the APK. It makes the app faster but adds to the file size.

**Optimisations already enabled in `app.json`:**
- `enableProguardInReleaseBuilds: true` — removes unused Java code (saves ~15MB)
- `enableShrinkResourcesInReleaseBuilds: true` — removes unused image/string resources (saves ~5-10MB)

These take effect in the **next APK build** — not in OTA updates (OTA only updates JS, not native code).

---

## 10. Key Design Decisions

### Multi-tenant architecture

The app works with any Frappe site — the URL is entered by the user on first launch, not hardcoded. This means:
- One APK works for all TechNiti clients
- Changing which Frappe site to connect to requires no code change
- All API calls dynamically read the site URL from device storage before each request

### Silent re-login

Frappe sessions expire after 6 hours, and the dev server restarts regularly. Rather than showing the login screen every day, the app saves the email and password on first login and automatically re-authenticates in the background when needed.

**Security note:** The password is stored in `AsyncStorage` (device storage). On modern Android (7+), this storage is encrypted with the device's hardware security chip. It is not accessible to other apps.

### Two-step punch (upload selfie first, then create checkin)

When the employee punches in:
1. The selfie is uploaded to Frappe first → get back a file URL
2. The file URL is sent to the `attendance_app_punch` Server Script along with GPS and time

**Why not upload simultaneously?** The Frappe `Before Save` validation script checks for `custom_selfie_image` at the moment the `Employee Checkin` is saved. If the selfie URL isn't in the payload at save time, the validation fails. There's no way to upload after the fact and retroactively satisfy the validator.

### Calendar uses two data sources

The monthly calendar reads from both `Attendance` (official HR records) and `Employee Checkin` (raw punches). This is because Frappe's Auto Attendance background job may not run immediately — there can be a delay of hours before checkins become official Attendance records. Without this dual-source approach, the calendar would show empty for days the employee has already punched.

---

## 11. Known Constraints

| Constraint | Reason | Workaround |
|---|---|---|
| Geofence locations are hardcoded in Frappe Server Script | The script has no config UI | Edit the script directly in Frappe desk when opening a new site |
| Selfie files are stored as public | Android OkHttp strips Cookie headers from Image requests; private files require auth | Files are scoped by name (selfie_timestamp.jpg); not guessable |
| OTA updates can't add new native modules | OTA only updates JS, not compiled Android code | Build and redistribute a new APK when adding native packages |
| Session expiry causes brief loading on re-login | Silent re-login makes an extra API call on startup | Invisible to user in most cases; shows the splash spinner for ~1 second |
| `constants.js` file exists but is unused | Legacy from before multi-tenant support was added | Do not import from it |
| Frappe Auto Attendance must run for official Present/Absent records | This is Frappe's design, not the app's | Calendar already shows checkin data even before Attendance is generated |

---

*Last updated: May 2026 | Built by TechNiti*
