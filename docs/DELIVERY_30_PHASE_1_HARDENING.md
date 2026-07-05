# Delivery 30 - Phase 1 Hardening Implementation

## Scope implemented

This delivery starts the Phase 1 hardening backlog from the action plan. It focuses on backend-first authorization, request validation, mutation-origin protection, safer health responses, and the QR/e-card security path.

## Main changes

### Central RBAC

- Added `server/rbac.ts` with a role and permission matrix.
- Added reusable helpers: `hasPermission`, `requirePermission`, `requireRole` and `AuthenticatedRequest`.
- Connected the central permission matrix to membership, finance, HR/payroll, scheduling, engagement, platform security, backups, audit logs and the compatibility records API.
- Added a whitelist for `/api/records/:table` so arbitrary table access is no longer accepted through the compatibility API.

### Validation and request hardening

- Added `server/validation.ts` with reusable Zod request validation middleware.
- Added body validation for high-risk QR/e-card PDF and delivery endpoints.
- Added safe payload limits for compatibility records.
- Added `server/originGuard.ts` to validate `Origin`/`Referer` for mutating API requests after authentication.

### QR/e-card security

- QR/e-card PDF generation and delivery now require `tokenId`, `memberId`, active token hash, active member, non-revoked token and an active subscription in the current date window.
- Raw access tokens are no longer printed in generated PDFs, fallback email/WhatsApp text, or the member UI token block.
- Remote e-card background image fetching is now allowlist-based through `ECARD_IMAGE_ALLOWED_ORIGINS`, blocks private/localhost targets, applies timeout, validates content type, and enforces a maximum byte size.
- E-card delivery logs no longer create pending rows before email/phone recipient validation succeeds.

### Health and sensitive operational endpoints

- Public `/api/health` no longer exposes DB host, port or raw connection error.
- `/api/db-health` now returns sanitized output by default and only includes diagnostic details for roles with `platform.health.detail`.
- Backup list/download/delete and manual backup trigger now require `platform.backups.manage`.
- Backup download/delete now use basename/canonical path checks and strict backup filename validation.
- Audit log endpoints now require platform audit permissions.

### Additional critical hardening included while implementing Phase 1

- Google OAuth mock behavior is disabled in production when OAuth credentials are missing.
- OAuth popup `postMessage` no longer uses wildcard `*`; it targets the configured app origin or current origin.
- The legacy password-reset endpoint is disabled in production unless explicitly enabled through `ALLOW_LEGACY_PASSWORD_RESET=true`.

## Environment variables added

```env
ALLOWED_ORIGINS=http://localhost:3000
ECARD_IMAGE_ALLOWED_ORIGINS=
ECARD_IMAGE_MAX_BYTES=2097152
ECARD_IMAGE_FETCH_TIMEOUT_MS=4000
ALLOW_LEGACY_PASSWORD_RESET=false
```

## Verification notes

- `npm ci` / `npm install` could not complete in the execution environment before timeout, so full project lint/build verification was blocked by dependency installation availability.
- A targeted TypeScript parse/type attempt was run with temporary verification shims; it did not expose syntax errors in the modified files, but it is not a replacement for a real `npm ci && npm run lint && npm run build` run.
- Logs are stored under `docs/verification/phase1_*` and `docs/verification/npm_phase1_*`.

## Next recommended actions

1. Run `npm ci && npm run lint && npm run build` in the normal development/CI environment.
2. Add integration tests for RBAC deny/allow paths, origin guard, e-card token mismatch, expired token, revoked token, inactive member, missing recipient and SSRF background image rejection.
3. Complete the full token-based password reset workflow with one-time hashed reset tokens and email/SMS delivery before enabling password reset in production.
4. Continue Phase 2 with lint/audit/build stabilization and automated tests.
