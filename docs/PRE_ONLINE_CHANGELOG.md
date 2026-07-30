# Pre-Online change record

Baseline tag: `Pre-Online`  
Baseline commit: `59a6be26799730d7b6d8b3cc6b68fbd8f1b0e59b`

## Navigation

- Removed Biometrics and Access Control from the visible navigation.
- Preserved their protected routes for backward-compatible direct access.
- Renamed the Evolution entry to Dashboard Evolution in every supported locale.
- Added a direct Dashboard Evolution action to the Dashboard header.

## Dashboard

- Replaced the visible Occupancy Rate card with Total Employees.
- Total Employees counts active records from the canonical `employees` table.
- Added a direct link to `/hr?tab=employees&status=active`.
- Extended the typed API contract and regression coverage.
- Retained occupancy calculations internally because the Action Center still uses them for scheduling warnings.

## Online installation

- Added `npm run install:online -- -w ...` for Windows.
- Added `npm run install:online -- -l ...` for Linux.
- The installer configures public URLs, origin protection, password reset URLs and cookie security.
- Database migrations run before the required administrator accounts are verified.
- The installer builds and validates the deployment before starting the service.
- Linux uses systemd with automatic restart and a five-minute health timer.
- Windows uses startup and five-minute health tasks with a restart-capable service runner.
- Optional `INSTALL_ALERT_WEBHOOK_URL` receives unhealthy installation alerts.

## Required accounts

- `admin@powergym.local` with role `admin`.
- `super_admin@powergym.local` with role `super_admin`.
- Both are created only when absent and their passwords are stored as scrypt hashes.
- The known initial password must be changed immediately after first login.

## Portability and compatibility

- Express continues to bind to `0.0.0.0`.
- Swagger and runtime logging use configurable public URLs.
- HTTPS domain deployments use secure cookies.
- Trusted HTTP/IP deployments can use non-secure cookies explicitly through generated configuration.
- The existing numbered SQL migration runner remains the single schema entry point.

## Verification

- Navigation and Dashboard destination tests.
- Typed Dashboard contract regression test.
- Cross-platform installer parsing and URL tests.
- Idempotent environment configuration test.
- Required-account test.
- Production URL binding test.

## Maintenance findings resolved

- Removed unused `serve` and `@google/genai` production dependencies.
- Re-synchronised `package-lock.json` with `package.json`.
- Updated the transitive Hono dependency through the non-breaking audit fix.
- Corrected commission payment confirmation so the frontend sends the explicit
  pending-customer-payment acknowledgement expected by the backend.

## React Router security review

- React Router and React Router DOM are pinned to `7.18.2` or later in the 7.x
  line. The maintainer advisory for `GHSA-qwww-vcr4-c8h2` identifies `7.18.2`
  as the patched 7.x release.
- PowerGym uses SPA `BrowserRouter` and does not use the unstable React Server
  Component APIs affected by the advisory.
- `npm run audit` now accepts this finding only when the patched version is
  installed and a source scan confirms that no affected RSC APIs are present.
  Every other vulnerability, an older version, or future RSC usage blocks CI.
- React Router 8 remains a planned compatibility migration, not an emergency
  security workaround.
