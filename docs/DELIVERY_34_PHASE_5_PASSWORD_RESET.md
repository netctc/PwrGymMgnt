# Delivery 34 - Phase 5 Tokenized Password Reset

## Scope

Phase 5 replaces the legacy direct password reset endpoint with a tokenized, auditable reset workflow for `admin_users`.

## Implemented changes

### Backend

- Added `server/passwordReset.ts` with a dedicated password reset route module.
- Added `POST /api/auth/password-reset/request`.
  - Accepts only an email address.
  - Returns an anti-enumeration generic response whether or not the account exists.
  - Creates a single-use reset token only for existing `admin_users` accounts.
  - Stores only an HMAC-SHA-256 token hash; the raw token is never persisted.
  - Revokes previously active unused tokens for the same user.
  - Applies a dedicated password reset rate limit.
  - Applies the mutating request Origin/Referer guard.
  - Logs the request in `audit_logs`.
- Added `POST /api/auth/password-reset/confirm`.
  - Requires a reset token and a new password.
  - Enforces server-side password complexity.
  - Rejects expired, used, revoked, unknown, or malformed tokens.
  - Updates `admin_users.password_hash` using the existing `scrypt$salt$hash` format.
  - Marks the token as used and revokes other active tokens for the user.
  - Logs completion in `audit_logs`.
- Replaced legacy `POST /api/auth/reset-password` with a `410 Gone` response.

### Database

- Added migration `sql/012_tokenized_password_reset.sql`.
- Added `password_reset_tokens` table with indexes for email, user, token hash, expiry, and status.
- Added foreign key from reset token records to `admin_users(id)`.

### Frontend

- Updated `src/pages/Login.tsx`.
- Forgot password is now a two-step flow:
  1. request reset instructions by email,
  2. paste/receive reset token and submit a new password.
- Supports `?resetToken=` or `?token=` URLs for token prefill.
- In non-production only, development reset token previews returned by the backend are automatically filled for local testing.

### Configuration

Added `.env.example` entries:

- `PASSWORD_RESET_TOKEN_PEPPER`
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`
- `PASSWORD_RESET_EXPOSE_DEV_TOKEN`

Production should configure `PASSWORD_RESET_TOKEN_PEPPER` as a long random secret. Prefer a value different from `JWT_SECRET`.

### Tests

Added `tests/passwordReset.test.ts` covering:

- email normalization,
- password complexity,
- token hashing,
- anti-enumeration behavior,
- token generation without raw-token persistence,
- password confirmation,
- token reuse rejection,
- legacy endpoint removal.

Updated `npm run test` and `npm run test:ci` to include the new test suite.

## Verification performed

Executed successfully in this environment after `npm ci --ignore-scripts`:

```bash
npm run lint
npm run test:ci
npm run build
npm run audit
```

Results:

- TypeScript lint/typecheck: OK
- Tests: OK, 24/24 passing
- Production build: OK
- npm audit: OK, 0 vulnerabilities

## Operational notes

- The backend currently creates a development preview token outside production. Disable this with `PASSWORD_RESET_EXPOSE_DEV_TOKEN=false` in shared development/staging environments.
- Production email/SMS delivery can be wired after this phase by sending the raw token or a link containing the token immediately after token creation.
- Do not log or persist raw reset tokens.
