# Phase 6 - Observability, Logging, and Auditability

## Objective

Phase 6 strengthens operational visibility without changing core business workflows. It replaces legacy generic API logging with structured observability primitives that are safer, easier to query, and easier to correlate during support or incident review.

## Implemented Changes

### 1. Structured application logging

Added `server/observability.ts` with a JSON structured logger.

Key properties:

- Emits `timestamp`, `level`, `component`, `message`, and structured metadata.
- Supports `LOG_LEVEL=debug|info|warn|error`.
- Supports `LOG_API_REQUESTS=false` to suppress per-request JSON logs.
- Redacts sensitive fields such as passwords, tokens, cookies, authorization headers, API keys, secrets, reset values, OTPs, and session data.

### 2. API request completion logs

`server.ts` now mounts `createApiStructuredLogMiddleware()` after request context creation and performance timing.

Each API request can produce a structured completion event containing:

- `requestId`
- method
- path without query string
- status code
- duration
- cache hit marker
- actor role when available

### 3. Security audit coverage moved earlier

`createApiAuditMiddleware()` is now mounted before API route registration. This expands `security_audit_events` coverage to include auth, password reset, and protected API traffic.

### 4. Legacy generic audit logging replaced

The old pre-auth `API Request Logger Middleware` wrote generic `API_METHOD` events as `system` before the authenticated user was known.

Phase 6 removes that block and adds `createUserActionAuditMiddleware()` after JWT authentication. It now records mutating user actions with:

- authenticated actor email / user id / role fallback,
- method,
- path,
- status code,
- duration,
- request ID,
- IP address,
- user agent,
- explicit success/failure action naming.

Action naming format:

```text
USER_ACTION_<METHOD>_<SUCCESS|FAILED>
```

Examples:

```text
USER_ACTION_POST_SUCCESS
USER_ACTION_DELETE_FAILED
```

### 5. Platform observability summary endpoint

Added:

```http
GET /api/platform/observability/summary
```

Protected by the existing platform observer permission through the platform route guard.

The endpoint summarizes:

- total API requests,
- server errors,
- access denials,
- average and maximum duration,
- total user actions,
- top user action types.

### 6. Operational audit helper

Added reusable helpers:

- `ensureOperationalAuditTable()`
- `writeOperationalAudit()`

These centralize writes to `audit_logs` and apply redaction before audit details are persisted.

## Environment Controls

```env
LOG_LEVEL=info
LOG_API_REQUESTS=true
SLOW_RESPONSE_LOG_MS=1500
```

## Verification

Added `tests/phase6Observability.test.ts` to verify:

- redaction behavior,
- user action audit naming,
- audit skip behavior,
- removal of legacy generic API audit middleware,
- registration of `/api/platform/observability/summary`,
- package script coverage.

## Operational Notes

- User action audit logging is non-blocking. A failed audit insert logs a warning but does not fail the user request.
- Request and audit logs use request IDs so support teams can correlate console logs, `security_audit_events`, and `audit_logs`.
- The audit middleware intentionally avoids persisting request bodies to reduce sensitive-data exposure.
