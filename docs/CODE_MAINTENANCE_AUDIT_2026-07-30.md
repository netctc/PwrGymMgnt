# PowerGym Code Maintenance Audit

Date: 2026-07-30  
Branch: `PwrGymCodex`  
Scope: application structure, operational scripts, database migration ownership, deployment portability, automated tests and maintainability.

## Executive conclusion

PowerGym has broad functional coverage and a substantial automated test suite. The application is suitable for controlled pre-production validation, but production release should remain blocked until the target database migrations, integrity checks, backup/restore procedure and external deployment smoke tests are executed with production-like configuration.

This maintenance pass removes duplicated runtime schema creation, aligns platform-version documentation, makes build cleanup portable across Windows and Linux, consolidates repeated environment keys and adds a repeatable maintenance audit command.

## Changes applied

1. Replaced the Unix-only `rm -rf` clean command with `scripts/clean-build.mjs`.
2. Removed the legacy startup schema bootstrap and route-level creation of `audit_logs` from `server.ts`; migrations own canonical tables and collation changes.
3. Removed runtime creation of `admin_users` from `db-init-users.mjs`; the script now requires migrations to be applied first.
4. Aligned Node.js documentation with Node 22 in `package.json`, Docker and Render.
5. Corrected the database compatibility declaration to MySQL 8+, matching use of window functions.
6. Consolidated duplicate keys in `.env.example`.
7. Corrected the super-admin bootstrap identifier to `super_admin@powergym.local`.
8. Removed the plaintext initial administrator password from source; installation now requires `POWERGYM_INITIAL_ADMIN_PASSWORD`.
9. Removed the client-exposed `VITE_SUPER_ADMIN_PASSWORD` setting.
10. Changed service installation to explicit opt-in and removed root/SYSTEM defaults.
11. Added `npm run maintenance:audit` for repeatable structural checks.

## Database compatibility

- `sql/000_master_schema.sql` is the canonical base schema.
- Incremental root migrations are applied after the master schema in filename order.
- Archived migrations 001-023 remain historical evidence and are not applied from `sql/archive`.
- Runtime routes no longer silently create canonical tables.
- Administrator initialization is idempotent but now fails clearly if migrations were not applied.
- Application queries use SQL features that require MySQL 8+; MariaDB compatibility requires separate integration validation.

Required validation against every target database:

```bash
npm run db:backup -- --label=pre-maintenance-validation
npm run db:migrate
npm run db:verify
npm run db:integrity -- --json
npm run db:demo:verify
```

## Module status

| Module | Current status | Evidence / residual risk |
| --- | --- | --- |
| Authentication and RBAC | Implemented | Strong permission tests; initial password is supplied securely at installation and must be rotated immediately. |
| Dashboard and Evolution | Implemented | Typed dashboard contracts and active employee metrics tested. |
| Members and subscriptions | Implemented | Legacy and V2 subscriptions coexist; database integrity validation remains mandatory. |
| Plans and trainer commissions | Implemented | Versioned plan assignments and partial commission payments depend on migrations 026-028. |
| Classes and Private PT | Implemented | Filters, pagination and PDF paths are covered by static/functional tests. |
| HR and payroll | Implemented | Accounting separation is present; validate real payroll posting with a staging database. |
| Accounting and ledger | Implemented | Filters/export exist; reconciliation with production opening balances remains operational work. |
| Warehouse, inventory and POS | Implemented | Product, stock and sales flows are tested; physical stock reconciliation is pending. |
| Reports and PDFs | Implemented | Dynamic member filters corrected; stakeholder acceptance of PDF content remains pending. |
| Support and notifications | Implemented | Delivery providers and real webhook credentials require environment validation. |
| Security and audit | Implemented | Security tests are broad; production secrets, origin rules and retention must be verified. |
| Backup and restore | Implemented | Windows-safe streaming backup exists; a full restore rehearsal is still required. |
| Online installer and monitoring | Implemented | Windows/Linux paths exist; external-host installation must be rehearsed on both platforms. |
| Localization | Implemented with follow-up | English, Arabic, French and Spanish are covered; manual linguistic QA remains recommended. |
| Legacy compatibility APIs | Transitional | Compatibility tables/routes remain technical debt until all consumers migrate. |

## Prioritized action plan

### P0 - Release blockers

1. Apply migrations and run integrity checks against the exact target database.
2. Configure a unique `POWERGYM_INITIAL_ADMIN_PASSWORD`, create the required accounts and rotate their passwords after first login.
3. Run `npm run verify:ci` from a clean checkout and retain the output as release evidence.
4. Execute a backup and full restore rehearsal before production cutover.
5. Run external smoke checks using the real domain/IP, TLS and allowed-origin configuration.

### P1 - High priority

1. Add mandatory GitHub Actions checks for typecheck, tests, build, audit and migration audit.
2. Validate Windows service tasks and Linux systemd units on real hosts.
3. Reconcile opening accounting balances and physical stock before go-live.
4. Exercise payment, renewal, commission and session-ledger concurrency in staging.
5. Define audit-log, notification and backup retention policies.

### P2 - Planned improvement

1. Retire compatibility tables and `/api/records/*` after confirming there are no consumers.
2. Split the large central server composition into smaller bounded route modules.
3. Replace remaining broad `any` types in business-critical finance and subscription paths.
4. Complete manual localization and accessibility review.
5. Add browser end-to-end coverage for the main user journeys.

## Verification commands

```bash
npm ci
npm run maintenance:audit
npm run typecheck
npm test
npm run build
npm run deploy:preflight -- --strict
npm run db:integrity -- --json
```

## Audit trail

This document records the scope, findings, changes and residual risks of the 2026-07-30 maintenance pass. Future reviews should append a dated entry containing the commit SHA, test totals, database target, migration result, integrity posture and deployment smoke result.
