# Phase 7 - Security Hardening

## Scope

Phase 7 strengthens authentication, session handling, production bootstrap controls, API documentation exposure, OAuth redirect safety and browser security headers.

The changes are intentionally low-risk and focus on controls that reduce production exposure without changing normal business workflows.

## Implemented controls

### 1. Strong JWT secret enforcement

`JWT_SECRET` is now resolved through `server/securityHardening.ts`.

Production now requires a JWT secret that:

- is present,
- is at least 32 characters long,
- does not use placeholder/default wording such as `change-me`, `default`, `secret`, or `password`.

Development keeps the existing dev fallback so local onboarding is not blocked.

### 2. Hardened session cookies

Session cookies are now created through a centralized helper.

Production session cookies use:

- `httpOnly: true`,
- `secure: true`,
- `sameSite: strict`,
- `path: /`.

Development keeps `sameSite: lax` and non-secure cookies for local HTTP testing.

### 3. Bootstrap login restricted in production

The environment-variable super-admin bootstrap login is disabled by default in production.

It can only be temporarily enabled with:

```env
ALLOW_ENV_BOOTSTRAP_LOGIN=true
```

This should only be used for emergency or first-deployment bootstrap, then disabled.

### 4. Admin setup endpoint gated in production

`/api/admin-setup` is disabled by default in production.

Production setup requires:

```env
ADMIN_SETUP_ENABLED=true
ADMIN_SETUP_TOKEN=<long random one-time token>
```

Production no longer accepts the setup token from query strings. Use the `x-admin-setup-token` header only.

### 5. API docs hidden by default in production

`/api-docs` is now hidden in production unless explicitly enabled:

```env
ENABLE_API_DOCS_IN_PRODUCTION=true
```

### 6. OAuth redirect URI allow-listing

Google OAuth redirect URI generation now validates the redirect URI against configured application origins and requires the `/api/auth/google/callback` path.

This reduces open redirect and OAuth misconfiguration risk.

### 7. Auth session claim normalization

`/api/auth/me`, `/api/auth/refresh`, and protected-route auth now normalize and validate role claims before returning or renewing a session.

### 8. Browser security headers expanded

Additional headers were added:

- `X-DNS-Prefetch-Control: off`,
- `X-Download-Options: noopen`,
- `Cross-Origin-Resource-Policy: same-origin`,
- `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'`,
- stricter `Permissions-Policy`.

## Operational guidance

Before production deployment, configure at minimum:

```env
NODE_ENV=production
JWT_SECRET=<long random secret, at least 32 characters>
APP_ORIGIN=https://your-domain.example
ALLOWED_ORIGINS=https://your-domain.example
PASSWORD_RESET_PUBLIC_BASE_URL=https://your-domain.example
PASSWORD_RESET_TOKEN_PEPPER=<long random reset pepper>
PASSWORD_RESET_EXPOSE_DEV_TOKEN=false
ADMIN_SETUP_ENABLED=false
ALLOW_ENV_BOOTSTRAP_LOGIN=false
ENABLE_API_DOCS_IN_PRODUCTION=false
```

If first admin bootstrap is required in production, temporarily set:

```env
ADMIN_SETUP_ENABLED=true
ADMIN_SETUP_TOKEN=<long random one-time token>
```

Then call `/api/admin-setup` using the `x-admin-setup-token` header and disable setup immediately after success.

## Validation

Run:

```bash
npm run test:ci
npm run lint
npm run build
npm run deploy:preflight -- --strict
```

