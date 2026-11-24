# Security Summary

- **Risk Level:** High
- **Reason:** The application handles multi-shop business accounting data, user authentication & RBAC, Google Drive/Sheets OAuth tokens, and server-side proxy endpoints (`server.ts`, `cloudflare/worker.js`, `firestore.rules`, `src/lib/firebase.ts`).
- **Tools Run:** `npm audit --json` (0 dependency vulnerabilities), static secret & configuration scan across all source files, and Firestore security rules verification.
- **Vulnerabilities Found:**
  1. **Hardcoded Configuration & Client-Side Environment Exposure:**
     - `src/lib/firebase.ts` and `server.ts` contained hardcoded fallback Firebase project/database IDs rather than reading from environment variables first.
     - `vite.config.ts` included a `define` block exposing `process.env.GEMINI_API_KEY` into the frontend bundle and left default source map settings unconstrained.
  2. **Server-Side Proxy Hardening (`/api/sms/proxy`):**
     - `isSafePublicHttpUrl` in `server.ts` did not block numeric/hex IP formats, IPv6 brackets, `127.0.0.0/8` range variations, or `100.64.0.0/10` carrier-grade NAT addresses, and echoed raw upstream error bodies back to the caller.
  3. **Multi-Shop Google Sheet Isolation:**
     - Secondary shops (`businessId !== "main-business"`) needed an explicit guard ensuring they can never inherit `main-business`'s `spreadsheetId` or bind an untagged spreadsheet whose `প্রতিষ্ঠান সেটিংস` tab contains a different shop's `Business ID`.
- **Fixes Applied:**
  - Extracted Firebase, Google OAuth, and Domain Allowlist configurations to environment variables (`VITE_FIREBASE_*`, `VITE_GOOGLE_OAUTH_CLIENT_ID`, `VITE_ALLOWED_DOMAINS`, `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`) with documented placeholders in `.env.example` and safe fallback to `firebase-applet-config.json`.
  - Removed `process.env.GEMINI_API_KEY` from `vite.config.ts` and enforced `build: { sourcemap: false, minify: 'esbuild' }` to prevent source code reconstruction from production builds.
  - Added `isAuthorizedDomain()` in `src/lib/firebase.ts` and enforced it at the root of `src/App.tsx` so unauthorized cloned domains are blocked when `VITE_ALLOWED_DOMAINS` is set.
  - Hardened `isSafePublicHttpUrl()` and sanitized error responses on `/api/sms/proxy` in `server.ts`, and removed dummy seed records from `server.ts`, `db.json`, and `src/components/Settings.tsx`.
  - Added cross-shop `spreadsheetId` collision guards in `src/lib/sheetsSync.ts`, `src/lib/sheetsApiClient.ts`, and `gas/Code.gs`.
- **Residual Risks:**
  - Configure `VITE_ALLOWED_DOMAINS` (e.g., `smarterp-5y9.pages.dev`) and Firebase Authorized Domains in the Google Cloud / Firebase Console to enforce strict origin restrictions in production.

## PoC Verification

- **Vulnerability:** SSRF filter bypass via numeric/IPv6/loopback subnet hostnames and upstream response leakage in `/api/sms/proxy`, plus cross-shop spreadsheet ID inheritance when switching shops.
- **Proof of Concept (Before Fix):**
  - Passing `http://127.0.0.2:3000/` or `http://[::1]:3000/` to `isSafePublicHttpUrl` bypassed exact `127.0.0.1` / `::1` checks, and failed requests echoed `err.response?.data` and `urlSent` directly to the client.
  - If a secondary shop had not yet created its own spreadsheet and an untagged sheet with a matching title existed in Google Drive, `findExistingShopSpreadsheetInDrive` could select `files[0]` without verifying the sheet's internal `Business ID` row in `প্রতিষ্ঠান সেটিংস`.
- **Verification (After Fix):**
  - `isSafePublicHttpUrl` now rejects any hostname containing `:`, decimal/hex integer literals, `127.*`, `169.254.*`, `10.*`, `192.168.*`, `100.64.*`, `172.16-31.*`, `.internal`, `.local`, and `.localhost`, and `/api/sms/proxy` returns a generic error message without leaking upstream payloads.
  - `getLocalSheetsConfig`, `fetchCloudSheetsConfig`, and `ensureShopGoogleSheet` explicitly strip `main-business`'s `spreadsheetId` from any non-main shop, and `findExistingShopSpreadsheetInDrive` inspects `'প্রতিষ্ঠান সেটিংস'!A1:B6` to verify `Business ID` before binding an untagged spreadsheet.
