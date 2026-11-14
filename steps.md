# openOTP — Build Steps & Project Tracker

## Project Overview

**openOTP** is an end-to-end OTP (One-Time Password) SMS dispatch system. It uses Android devices as SMS gateways: a central server receives OTP requests via REST API, queues them, dispatches to idle Android devices over WebSocket (Socket.io), and the devices send the actual SMS. A lightweight web UI provides full control and monitoring.

### Architecture

```
┌──────────────┐     REST API      ┌───────────────┐     Socket.io     ┌──────────────┐
│  Web UI /    │ ───────────────▶ │   Server      │ ───────────────▶ │  Android     │
│  External    │   POST /request  │  (Node.js)    │   emit send-sms  │  Device      │
│  Services    │ ◀─────────────── │  Queue +      │ ◀─────────────── │  (SMS gate)  │
└──────────────┘   GET /status    │  Dispatch     │   emit sms-result └──────────────┘
                                  └───────────────┘
                                         │
                                    Socket.io stats
                                         │
                                  ┌──────────────┐
                                  │  Web UI      │
                                  │  Dashboard   │
                                  └──────────────┘
```

### Tech Stack
- **Server**: Node.js, Express, Socket.io
- **Android**: Java, Socket.io-client, AndroidX, SmsManager
- **Web UI**: Vanilla HTML/CSS/JS + Socket.io client

---

## Build Steps

### Phase 1: Server Foundation ✅
1. Created `server/package.json` with dependencies (express, cors, socket.io, uuid, socket.io-client)
2. Created `server/src/index.js` — HTTP server + Socket.io server entry point
3. Created `server/src/app.js` — Express app with CORS, JSON body parser, static file serving
4. Created `server/src/routes/otp.js` — REST API routes (POST /request, GET /status, GET /requests)
5. Created `server/src/services/queue.js` — in-memory queue with dispatch logic
6. Created `server/src/socket/deviceHandler.js` — Socket.io connection handler for Android devices

### Phase 2: Queue & Dispatch Logic ✅
7. Implemented `enqueue()` — adds OTP request to queue, triggers dispatch
8. Implemented `registerDevice()` — registers Android device as idle
9. Implemented `removeDevice()` — removes device on disconnect, requeues in-flight tasks
10. Implemented `markResult()` — records SMS send success/failure from device
11. Implemented `tryDispatch()` — finds idle device + queued task, emits `send-sms` event
12. Implemented `getStats()` / `notifyStats()` — stats snapshot + broadcast to UI clients

### Phase 3: Web UI Dashboard ✅
13. Created `web-ui/index.html` — lightweight single-page dashboard
14. Added stats grid (Queued, Dispatched, Sent, Failed, Devices Online)
15. Added "Send OTP Request" form (phone + message → POST /api/otp/request)
16. Added "Connected Devices" table with online/offline status dots
17. Added "Recent Requests" table with status badges
18. Socket.io client connects to server, listens for `stats` events, re-renders UI

### Phase 4: Android App ✅
19. Created Gradle config files (build.gradle, settings.gradle, gradle.properties, wrapper)
20. Created `AndroidManifest.xml` — permissions: SEND_SMS, INTERNET, FOREGROUND_SERVICE
21. Created `MainActivity.java` — UI + Socket.io client + SMS sending via SmsManager
22. Created `DeviceService.java` — foreground service to keep WebSocket alive
23. Created layout XML + resource files (strings.xml, styles.xml)

### Phase 5: Heartbeat System ✅
24. Server: heartbeat config (15s interval, 45s timeout, 10s stale check)
25. Server: `heartbeat()` function + `startStaleChecker()` + `heartbeat-ack` response
26. Server: `lastHeartbeat` and `isOnline` fields in stats
27. Android: `heartbeatHandler`/`heartbeatRunnable` emits `heartbeat` every 15s
28. Android: `onHeartbeatAck` listener updates UI with green "✓ HH:mm:ss"
29. Web UI: online/offline colored dots + "Devices Online" stat + "Last Heartbeat" column

### Phase 6: Dynamic Server IP Configuration ✅
30. Android: `etServerUrl` input + SharedPreferences persistence + `btnSaveSettings` button
31. Android: `swAutoConnect` toggle for auto-connect on startup

### Phase 7: API Key Authentication ✅
32. Created `server/src/middleware/auth.js` — `restAuth` + `socketAuth` + `isAuthEnabled`
33. Applied auth to all REST routes and Socket.io connections
34. Auth disabled (open mode) when `API_KEY` env var not set
35. Added auth status log on server startup

### Phase 8: Retry Logic ✅
36. Added `MAX_RETRIES = 3` — failed SMS tasks retry up to 3× before permanent failure
37. `markResult()` requeues on failure, increments `retryCount`, marks failed after max retries

### Phase 9: Dispatch Timeout Handling ✅
38. Added `startTimeoutChecker()` — requeues tasks stuck in "dispatched" > 60s
39. Timeout checker frees the assigned device and requeues the task

### Phase 10: Configurable Heartbeat Interval ✅
40. Server: `pushHeartbeatConfig()` emits `heartbeat-config` event with custom interval
41. Server: REST endpoint `POST /api/otp/heartbeat-config` + socket event handler
42. Android: `onHeartbeatConfig` listener adjusts timer dynamically (5s–120s range)
43. Web UI: "Heartbeat Configuration" panel with interval + target device input

### Phase 11: Gradle Wrapper & Testing ✅
44. Created `gradlew` (Unix, executable) + `gradlew.bat` (Windows) wrapper scripts
45. Created `test-e2e.js` — end-to-end integration test
46. Created `test-heartbeat.js` — heartbeat flow test
47. All server files pass syntax checks; server boots correctly

### Phase 12: Project Cleanup ✅
48. Copied project to `/home/madeb/openOTP/`; removed node_modules and artifacts
49. Created this `steps.md` tracker file

---

### Phase 13: Bug Fixes for Testing Environment ✅
50. Fixed missing launcher icon — created `res/drawable/ic_launcher.xml` (vector drawable), changed manifest to `@drawable/ic_launcher` (was `@mipmap/ic_launcher` which didn't exist — build would fail)
51. Fixed `startService()` → `ContextCompat.startForegroundService()` (would crash on Android 8+)
52. Added `FOREGROUND_SERVICE_DATA_SYNC` permission to manifest (required for targetSdk 34 on Android 14)
53. Added `POST_NOTIFICATIONS` permission + runtime request (required for Android 13+)
54. Fixed `startForeground()` to include `ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC` on API 34+ (would crash on Android 14)
55. Fixed `updateButtonState()` — now properly disables Connect button and enables Disconnect button when connected (was changing Connect text to "Disconnect", causing duplicate sockets on repeated taps)
56. Added `updateButtonState()` call in `onCreate()` for correct initial button states

### Phase 14: Crash-on-Launch Fixes (Real Device) ✅
57. Fixed `log()` NullPointerException — `tvLog.getLayout()` returns null before the TextView's first layout pass; added null-guard so `log()` no longer crashes when called before the view is rendered (was the primary crash cause on real phones)
58. Fixed double `launch()` in `requestSmsPermission()` — was calling `smsPermissionLauncher.launch()` twice in a row (SMS + POST_NOTIFICATIONS), which can throw `IllegalStateException` inside `onCreate`; now collects all needed permissions and launches once
59. Fixed deprecated `Build.SERIAL` in `loadSettings()` — returns "unknown" on Android 10+ and can cause issues on OEM ROMs; replaced with `Settings.Secure.ANDROID_ID` (stable per-device hex string) with null fallback

## How to Run

### Server
```bash
cd openOTP/server
npm install
npm start                          # starts on port 3000 (open mode)
API_KEY=mysecret npm start         # with API key auth enabled
```

### Web UI
Open `http://localhost:3000` in a browser (served by the server).

### Android App
```bash
cd openOTP/android
./gradlew assembleDebug            # requires JDK 17+ and Android SDK
# APK output: app/build/outputs/apk/debug/app-debug.apk
```
Install on device → enter server IP → grant SMS permission → tap Connect.

---

## Features Summary

| Feature | Status |
|---|---|
| OTP request queue + dispatch | ✅ Done |
| Socket.io device connections | ✅ Done |
| REST API for external services | ✅ Done |
| Web UI dashboard | ✅ Done |
| Heartbeat (15s interval, 45s timeout) | ✅ Done |
| Dynamic server IP config (Android) | ✅ Done |
| Configurable heartbeat (server push) | ✅ Done |
| API key auth (REST + Socket) | ✅ Done |
| Retry logic (3 attempts) | ✅ Done |
| Dispatch timeout (60s requeue) | ✅ Done |
| Stale device detection | ✅ Done |
| Gradle wrapper scripts | ✅ Done |
| E2E + heartbeat tests | ✅ Done |
| Android APK compiled | ✅ Done (3.5MB app-debug.apk) |

---

## Next Steps / TODO

- [x] Install JDK 17+ and Android SDK to compile the Android APK
- [x] Run `./gradlew assembleDebug` to verify Android builds — **BUILD SUCCESSFUL** (3.5MB APK)
- [ ] Test on a physical Android device with a SIM card
- [ ] Add request rate limiting
- [ ] Add persistent storage (Redis/DB) for queue survival across restarts
- [ ] Add multi-server clustering support
- [ ] Add detailed logging/audit trail
- [ ] Add Prometheus metrics endpoint
- [ ] Add Docker containerization

---

## Phase 15: textbee-style SMS Gateway SaaS Rewrite ✅

Rewrote openOTP to work like [textbee](https://github.com/textbee/textbee) — an open-source Android SMS gateway — but as a SaaS, using the existing stack (Express + vanilla web UI + Java Android) so it runs immediately.

### Architecture (now mirrors textbee's pull-based REST model)
```
┌──────────────┐    REST (x-api-key)   ┌───────────────┐   poll/claim (REST)   ┌──────────────┐
│  Web Dashboard│ ───────────────────▶ │   Server      │ ◀──────────────────▶ │  Android     │
│  (SaaS UI)    │   Bearer token       │  (Express)    │   send-sms / status   │  SMS Gateway │
│  login/stats  │ ◀─────────────────── │  JSON store   │ ◀──────────────────▶ │  (SmsManager)│
└──────────────┘   socket.io 'change'  └───────────────┘   receive-sms         └──────────────┘
```

### Server (Express, no new deps — Node crypto + uuid)
60. Added `src/services/store.js` — JSON-file-backed store (users, devices, sms messages, sms batches) with scrypt password hashing + HMAC tokens
61. Rewrote `src/middleware/auth.js` — signed Bearer tokens (dashboard) + `x-api-key` header (devices)
62. Added `src/routes/auth.js` — `POST /api/auth/register|login`, `GET /api/auth/me`, `POST /api/auth/api-key`
63. Added `src/routes/gateway.js` — full `/gateway/*` API mirroring textbee: stats, devices, send-sms, send-bulk-sms, receive-sms, sms-status, heartbeat, messages/pending, messages/claim, sms history, batches
64. Added `src/socket/live.js` — lightweight `change` ping so the dashboard re-fetches
65. Removed old OTP dispatch files (otp routes, queue, deviceHandler, e2e/heartbeat tests)

### Web UI (vanilla HTML/CSS/JS SaaS dashboard)
66. Rewrote `web-ui/index.html` — login/register → dashboard: stats cards, devices table (online dots), send-SMS panel, message history, API key panel with rotate; live updates via socket.io + polling

### Android (Java — switched from Socket.io to textbee's pull-based REST)
67. Added `GatewayClient.java` — HttpURLConnection REST client (register, claim, sms-status, receive-sms, heartbeat)
68. Added `SmsPollService.java` — foreground service: claim pending → SmsManager send → report status → heartbeat every 30s
69. Added `SmsReceiver.java` — forwards incoming SMS to server; `SmsStatusReceiver.java` — reports sent/delivered callbacks
70. Rewrote `MainActivity.java` — API-key onboarding → register device → start/stop gateway service
71. Updated manifest (RECEIVE_SMS, READ_PHONE_STATE, SmsReceiver/SmsStatusReceiver/SmsPollService), layout, strings; removed socket.io/okhttp deps; deleted old DeviceService
72. **BUILD SUCCESSFUL** — `app-debug.apk` (3.0 MB)

### Verified end-to-end
Register → login → register device (x-api-key) → send-sms → claim (pull) → sms-status → receive-sms → heartbeat → stats — all passing.

## Next Steps / TODO (redesign phase)
- [ ] Redesign system/work logic (per user plan)
- [ ] Add webhooks (textbee has webhook subscriptions + delivery events)
- [ ] Add multi-SIM support (simSubscriptionId / simSlotIndex selection)
- [ ] Add request rate limiting + per-user quotas (SaaS billing tiers)
- [ ] Add persistent DB (Mongo/Postgres) to replace JSON file store
- [ ] Add FCM push to wake the Android poller (textbee uses FCM)
- [ ] Add API key scopes + dashboard user management

---

## Phase 16: Product-Grade Landing + Sidebar Portals + Admin Data Tables ✅

### Landing page (single CTA → Client Portal)
73. Rewrote `frontend/src/App.jsx` — full marketing landing: sticky nav, hero with gradient headline + "Start Sending Free →" CTA to the Client Portal, terminal-style curl code sample, 6-feature grid, 3-step "how it works", CTA banner, footer (admin access reduced to a discreet footer link — the public page no longer advertises two portals)
74. Added landing + sidebar CSS (`.lhero`, `.feat-grid`, `.shell`, `.sidenav`, responsive breakpoints) to `frontend/index.html`

### Client Portal (sidebar, message-centric — devices hidden)
75. Rewrote `frontend/src/client/ClientApp.jsx` with sidebar navigation: **Dashboard / Messages / Send SMS / API Keys / Integration**
76. Dashboard shows only what a client cares about: Sent / Delivered / Failed / Pending stat cards, delivery-rate progress bar, recent messages table (device counts removed)
77. Messages page: Sent/Received tabs, status filter, detail modal, pagination, CSV export (all pages fetched)
78. New Send SMS page — test-send via the same `/api/v1/messages` endpoint apps use
79. Integration page: credentials, copyable cURL/JavaScript/Python examples, endpoint reference

### Admin Portal (sidebar, everything in tables + statistics)
80. Rewrote `frontend/src/admin/AdminApp.jsx` with sidebar navigation: **Overview / Users / Devices / Messages / Batches**
81. Overview: 10 stat cards + donut chart (status mix) + grouped bar chart (14-day traffic) + top-users table (zero-dependency SVG/CSS charts in `ui.jsx`)
82. Users table: full CRUD via modals (create, edit email/role/enabled, reset password, delete), search, **CSV/JSON export**, **CSV/JSON import** with duplicate skipping + per-row errors
83. Devices table: global list with owner email, online/enabled toggles, edit modal (name, enable, SIM routing: any/roundrobin/fixed), delete, CSV/JSON export
84. Messages table: type/status filters, text search, detail modal, delete, paginated, CSV export
85. Batches table: paginated, CSV export

### Server (new admin/table APIs)
86. `store.js`: `getAllDevices`, `getAllMessages` (filters + search + owner/device enrichment), `getAllBatches`, `deleteMessage`, `importUsers` (bulk, dedupe), `getAnalytics` (status mix, 14-day per-day traffic, top users); `updateUser` now supports email rename (uniqueness-checked), password reset; `getMessagesByUser` accepts `type` (sent|received)
87. `routes/admin.js`: `GET /analytics`, `GET|PATCH|DELETE /devices`, `GET|DELETE /messages`, `GET /batches`, `POST /users/import`; stats now include `received`
88. `routes/client.js`: `GET /api/v1/messages?type=received` for the client portal's Received tab
89. New shared UI kit in `ui.jsx`: Shell (sidebar), Modal, Notice, Pagination, SearchBox, Select, StatusBadge, DetailRows, BarChart, DonutChart, toCSV/downloadFile/parseCSV/csvToObjects/fetchAllPages, ImportDialog
90. New utility `server/create-admin.js` — create/promote an admin from the CLI

### Verified end-to-end (server on :3001)
- `e2e-test.js` — **23 passed** (regression, gateway flow unchanged)
- `sim-e2e.js` — **13 passed** (regression, SIM routing unchanged)
- `admin-e2e.js` (new) — **25 passed**: admin auth/403 guard, stats+received, analytics shape, user CRUD + password reset + duplicate-email 400, bulk import (created/skipped/errors), device list/patch/delete, message log enrichment + filters + search + delete, batches, client `type=received` filter
- Frontend rebuilt (`vite build`, 38 modules) and served by the Express server; landing CTA verified in the served bundle
