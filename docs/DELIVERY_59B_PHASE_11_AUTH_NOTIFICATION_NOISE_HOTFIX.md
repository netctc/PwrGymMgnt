# Delivery 59B - Phase 11B Auth/Notification Noise Hotfix

## Trigger

Runtime logs after Phase 11A showed expected unauthenticated startup probes returning `401`:

- `GET /api/auth/me`
- `GET /api/engagement/notifications`

The server was healthy and MySQL connected, but the frontend could start notification polling before a valid authenticated user was available. This created noisy warning logs during normal unauthenticated startup or after an expired session.

## Changes

### 1. Frontend notification polling guard

Updated `src/components/Layout.tsx`:

- `Layout` now reads `user` from `useAuth()`.
- Notification loading exits early when no authenticated user exists.
- The polling interval is only started when `user?.uid` is available.
- Notifications are reset when the user is not authenticated.
- `markAllRead` exits early when no user is present.

This prevents `/api/engagement/notifications` from being called before login.

### 2. Expected auth-probe log-level normalization

Updated `server/observability.ts`:

- Added `isExpectedUnauthenticatedProbe()`.
- Added `requestLogLevel()`.
- Expected unauthenticated `GET /api/auth/me` and `GET /api/engagement/notifications` responses are logged as `info`, not `warn`.
- Other `401`, `403`, and `4xx` responses remain warnings.
- `5xx` responses remain errors.

This keeps real unauthorized access visible while avoiding warning noise for normal session-check probes.

### 3. Tests

Updated:

- `tests/phase6Observability.test.ts`
- `tests/phase11LocalizationCompletion.test.ts`

Coverage added for:

- expected unauthenticated probes logging as `info`,
- operational unauthorized mutations still logging as `warn`,
- notification polling requiring an authenticated user.

## Validation

Static checks were run in the sandbox. Full `npm run lint` could not be completed here because this sandbox copy does not contain installed dependencies such as React and Node type packages. The user's local environment previously ran the full suite with dependencies installed.

Recommended local validation:

```bash
npm run test:ci
npm run lint
npm run build
npm run dev
```

Expected runtime behavior:

- Before login, `GET /api/auth/me` may still return `401`, but should not be logged as a warning.
- Before login, the frontend should not call `/api/engagement/notifications`.
- After login, notification polling should resume normally.
