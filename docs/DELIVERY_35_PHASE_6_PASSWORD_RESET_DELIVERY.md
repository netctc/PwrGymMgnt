# Delivery 35 - Phase 6 Password Reset Email/SMS Delivery

## Summary
Phase 6 connects the secure tokenized password reset workflow from Phase 5 to configurable delivery channels. The reset token is still never persisted in raw form. It is used only to build a short-lived reset link and send it through an approved provider.

## Files Added
- `server/passwordResetDelivery.ts`
- `tests/passwordResetDelivery.test.ts`
- `sql/013_password_reset_delivery_channels.sql`
- `docs/DELIVERY_35_PHASE_6_PASSWORD_RESET_DELIVERY.md`

## Files Updated
- `server/passwordReset.ts`
- `tests/passwordReset.test.ts`
- `package.json`
- `.env.example`

## Backend Changes
### Delivery abstraction
`server/passwordResetDelivery.ts` adds a provider-neutral delivery layer for password reset instructions.

Supported email providers:
- `disabled`
- `console`
- `webhook`
- `sendgrid`

Supported SMS providers:
- `disabled`
- `console`
- `webhook`
- `twilio`

No new runtime dependency was added. Providers use Node 22 native `fetch`.

### Reset URL generation
Reset links are built from:
- `PASSWORD_RESET_PUBLIC_BASE_URL`
- fallback: `APP_PUBLIC_URL`, `PUBLIC_APP_URL`, `APP_ORIGIN`, `PUBLIC_APP_ORIGIN`, `VITE_APP_ORIGIN`
- `PASSWORD_RESET_PATH`, default `/login`

The generated link uses:

```text
/login?resetToken=<token>
```

The existing frontend already reads `resetToken` or `token` from the URL and switches to confirm-reset mode.

### Templates
The delivery layer includes:
- HTML email template
- plain-text email template
- SMS template

The templates include:
- app name
- secure reset link
- expiration time
- ignore-if-not-requested warning

### Delivery audit and status
`server/passwordReset.ts` now records delivery metadata in `password_reset_tokens`:
- `delivery_request_id`
- `delivery_channel`
- `delivery_status`
- `delivery_provider`
- `delivery_last_error`
- `delivered_at`

It also writes a `PASSWORD_RESET_DELIVERY_ATTEMPTED` audit event with masked destinations and provider status.

## Database Migration
`sql/013_password_reset_delivery_channels.sql` adds:

### `admin_users`
- `reset_phone VARCHAR(32) NULL`
- `reset_delivery_channel VARCHAR(32) NULL`

### `password_reset_tokens`
- delivery request/status fields
- indexes for delivery request/status lookup

The migration is written to be idempotent because the current migration runner replays SQL files.

## Environment Variables
### Core
```bash
PASSWORD_RESET_PUBLIC_BASE_URL=https://your-domain.example
PASSWORD_RESET_PATH=/login
PASSWORD_RESET_DELIVERY_CHANNELS=email
```

### Email
```bash
PASSWORD_RESET_EMAIL_PROVIDER=disabled # disabled | console | webhook | sendgrid
PASSWORD_RESET_EMAIL_FROM=no-reply@your-domain.example
PASSWORD_RESET_EMAIL_FROM_NAME=PowerGym Management
PASSWORD_RESET_EMAIL_WEBHOOK_URL=
PASSWORD_RESET_EMAIL_WEBHOOK_SECRET=
SENDGRID_API_KEY=
```

### SMS
```bash
PASSWORD_RESET_SMS_PROVIDER=disabled # disabled | console | webhook | twilio
PASSWORD_RESET_SMS_FROM=
PASSWORD_RESET_SMS_WEBHOOK_URL=
PASSWORD_RESET_SMS_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_PHONE=
```

## Production Recommendations
1. Set `PASSWORD_RESET_EXPOSE_DEV_TOKEN=false`.
2. Set `PASSWORD_RESET_PUBLIC_BASE_URL` to the public HTTPS app URL.
3. Configure one email provider before enabling production password resets.
4. Use SMS only for accounts with `admin_users.reset_phone` populated.
5. Keep provider secrets out of source control.
6. Monitor `PASSWORD_RESET_DELIVERY_ATTEMPTED` audit events and `password_reset_tokens.delivery_status`.

## Verification Commands
Run locally or in CI:

```bash
npm ci
npm run lint
npm run test:ci
npm run build
npm run audit
```

## Notes
The sandbox could not complete `npm ci` before the execution timeout in this phase. The implementation avoids dependency changes, so no package installation or audit-impacting package update is required for this delivery.
