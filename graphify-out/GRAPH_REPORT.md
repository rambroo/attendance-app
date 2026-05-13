# Graph Report - graphify-out  (2026-04-17)

## Corpus Check
- Corpus is ~10,904 words - fits in a single context window. You may not need a graph.

## Summary
- 72 nodes · 148 edges · 12 communities detected
- Extraction: 87% EXTRACTED · 12% INFERRED · 1% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `App Root Component` - 10 edges
2. `HomeScreen` - 10 edges
3. `siteConfig Utilities` - 9 edges
4. `getTodayCheckins()` - 8 edges
5. `Axios API Client (Dynamic Base URL)` - 8 edges
6. `createCheckin()` - 7 edges
7. `getAttendanceHistory()` - 7 edges
8. `getMonthSummary()` - 7 edges
9. `AUTH_KEYS Constant (AsyncStorage key list)` - 7 edges
10. `logout()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `AsyncStorage Cache Layer (checkins/attendance)` --semantically_similar_to--> `getCachedEmployee()`  [INFERRED] [semantically similar]
  src/api/attendanceApi.js → R:\TechNiti\apps\attendance-app\src\api\attendanceApi.js
- `uploadSelfie()` --semantically_similar_to--> `Axios API Client (Dynamic Base URL)`  [INFERRED] [semantically similar]
  R:\TechNiti\apps\attendance-app\src\api\attendanceApi.js → src/api/apiClient.js
- `uploadSelfie()` --shares_data_with--> `siteConfig Utilities`  [INFERRED]
  R:\TechNiti\apps\attendance-app\src\api\attendanceApi.js → src/utils/siteConfig.js
- `Response Interceptor (session expiry handler)` --rationale_for--> `App-Level Auth & Site State Machine`  [INFERRED]
  src/api/apiClient.js → App.js
- `getEmployeeByEmail()` --calls--> `Axios API Client (Dynamic Base URL)`  [EXTRACTED]
  R:\TechNiti\apps\attendance-app\src\api\attendanceApi.js → src/api/apiClient.js

## Hyperedges (group relationships)
- **Punch In/Out Flow (Modal + Checkin API + Location/Selfie)** — punchmodal_component, attendanceapi_createcheckin, attendanceapi_uploadselfie [EXTRACTED 0.95]
- **Session & Auth Management (interceptor + authApi + app state)** — apiclient_responseinterceptor, authapi_authkeys, app_authflow [INFERRED 0.85]
- **Offline-First Cache Pattern (cache-then-network)** — attendanceapi_cachelayer, attendanceapi_gettodaycheckins, attendanceapi_getattendancehistory [INFERRED 0.90]
- **Placeholder Branding Assets (Concentric Circles Theme)** — adaptive_icon_appicon, icon_appicon, splash_splashscreen [INFERRED 0.85]
- **All App Branding Assets** — adaptive_icon_appicon, favicon_expodefault, icon_appicon, splash_splashscreen [EXTRACTED 1.00]

## Communities

### Community 0 - "App Root Component / authApi.js"
Cohesion: 0.24
Nodes (16): App Root Component, App-Level Auth & Site State Machine, AUTH_KEYS Constant (AsyncStorage key list), getSiteBase(), isAuthenticated(), loginWithApiKey(), loginWithPassword(), logout() (+8 more)

### Community 1 - "attendanceApi.js / formatDate()"
Cohesion: 0.25
Nodes (2): formatDate(), formatDateTime()

### Community 2 - "getTodayCheckins() / getAttendanceHistory()"
Cohesion: 0.43
Nodes (8): getAttendanceHistory(), getCache(), getMonthSummary(), getTodayCheckins(), Date/Time Formatter Helpers, sessionExpiredError(), setCache(), HistoryScreen

### Community 3 - "siteConfig.js / clearSiteConfig()"
Cohesion: 0.33
Nodes (0): 

### Community 4 - "HomeScreen / AsyncStorage Cache Layer (checkins/attendance)"
Cohesion: 0.53
Nodes (6): AsyncStorage Cache Layer (checkins/attendance), getCachedEmployee(), getCachedTodayCheckins(), getEmployeeByEmail(), getStoredUser(), HomeScreen

### Community 5 - "Adaptive Icon (Concentric Circles Placeholder) / Attendance App Branding Assets"
Cohesion: 0.73
Nodes (6): Adaptive Icon (Concentric Circles Placeholder), Attendance App Branding Assets, Attendance App Visual Design (Minimalist / Placeholder), Favicon (Expo Default Cube Logo), App Icon (Concentric Circles Placeholder), Splash Screen (Concentric Circles Placeholder)

### Community 6 - "HomeScreen.js / theme.js"
Cohesion: 0.5
Nodes (0): 

### Community 7 - "App.js / HistoryScreen.js"
Cohesion: 0.4
Nodes (0): 

### Community 8 - "Axios API Client (Dynamic Base URL) / createCheckin()"
Cohesion: 0.5
Nodes (5): Axios API Client (Dynamic Base URL), Request Interceptor (dynamic baseURL + auth headers), Response Interceptor (session expiry handler), createCheckin(), uploadSelfie()

### Community 9 - "LoginScreen.js / LoginScreen()"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "SiteSetupScreen.js / SiteSetupScreen()"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "constants.js"
Cohesion: 1.0
Nodes (0): 

## Ambiguous Edges - Review These
- `Favicon (Expo Default Cube Logo)` → `Attendance App Visual Design (Minimalist / Placeholder)`  [AMBIGUOUS]
  assets/favicon.png · relation: conceptually_related_to

## Knowledge Gaps
- **2 isolated node(s):** `App Entry Point`, `API_BASE_URL Constant`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `LoginScreen.js / LoginScreen()`** (2 nodes): `LoginScreen.js`, `LoginScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SiteSetupScreen.js / SiteSetupScreen()`** (2 nodes): `SiteSetupScreen.js`, `SiteSetupScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `constants.js`** (1 nodes): `constants.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Favicon (Expo Default Cube Logo)` and `Attendance App Visual Design (Minimalist / Placeholder)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `siteConfig Utilities` connect `App Root Component / authApi.js` to `Axios API Client (Dynamic Base URL) / createCheckin()`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `App Root Component` connect `App Root Component / authApi.js` to `getTodayCheckins() / getAttendanceHistory()`, `HomeScreen / AsyncStorage Cache Layer (checkins/attendance)`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `HomeScreen` connect `HomeScreen / AsyncStorage Cache Layer (checkins/attendance)` to `App Root Component / authApi.js`, `Axios API Client (Dynamic Base URL) / createCheckin()`, `getTodayCheckins() / getAttendanceHistory()`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `siteConfig Utilities` (e.g. with `Request Interceptor (dynamic baseURL + auth headers)` and `uploadSelfie()`) actually correct?**
  _`siteConfig Utilities` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `App Entry Point`, `API_BASE_URL Constant` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._