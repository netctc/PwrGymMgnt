# Delivery 10 - Database Connectivity and Runtime Resilience Fix

## Problem observed

Runtime logs showed repeated MySQL network errors such as:

- `getaddrinfo ENOTFOUND srv564.hstgr.io`
- `read ECONNRESET`
- `connect ETIMEDOUT`

These errors mean the application could not reliably reach the configured MySQL host. The server also attempted some schema checks during request handling, which made the logs noisy when the database was unavailable.

## Fixes implemented

- Added explicit `DATABASE_PORT` / `DB_PORT` support.
- Added `DATABASE_CONNECT_TIMEOUT_MS` / `DB_CONNECT_TIMEOUT_MS` support.
- Added MySQL keep-alive and connection timeout settings.
- Added verified pool creation before marking MySQL as connected.
- Added automatic pool reset and reconnect attempts after recoverable MySQL network failures.
- Changed request audit logging so it no longer creates tables on every request.
- Added 503 handling for transient database connectivity failures.
- Added engagement schema initialization caching/cooldown to prevent repeated table creation attempts during outages.
- Added `npm run db:diagnose` to test DNS, TCP, and MySQL login separately.
- Updated README troubleshooting notes.

## How to diagnose locally

```bash
npm run db:diagnose
```

If `ENOTFOUND` appears, the configured host is not resolvable from the machine running the app. Use `localhost` for local MySQL, or the exact MySQL hostname from the hosting provider database panel for remote MySQL.

If `ETIMEDOUT` appears, DNS resolved but TCP access failed. Check firewall, remote MySQL permissions, hosting allowlist, VPN, and port 3306.

If MySQL login fails, check username, password, database name, and user grants.
