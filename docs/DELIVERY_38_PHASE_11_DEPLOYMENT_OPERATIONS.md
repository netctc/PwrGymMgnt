# Delivery 38 - Phase 11 Deployment and Operations

## Goal

Add a repeatable production operations layer around the application so releases include preflight checks, backup-before-migrate, post-deploy smoke tests, rollback guidance and deployment documentation.

## Added scripts

- `npm run deploy:preflight`
  - Validates critical production environment settings.
  - Blocks production deployments when secrets, database config, origins, password reset URL or reset token pepper are unsafe.
  - Supports JSON output with `npm run deploy:preflight -- --json`.

- `npm run db:backup`
  - Creates a MySQL SQL dump with `mysqldump`.
  - Uses `--single-transaction`, `--quick`, `--routines`, `--triggers` and `--events`.
  - Supports `--dry-run`, `--label`, `--output-dir`, `--output` and `--retention-days`.
  - Prunes old `.sql` backup files according to retention.

- `npm run deploy:smoke`
  - Runs HTTP smoke tests against `/api/health`.
  - Can include `/api/db-health` with `--include-db`.
  - Can include deployment readiness with `--include-readiness`.
  - Supports `--base-url`, `DEPLOY_BASE_URL`, `--json` and `DEPLOY_SMOKE_AUTH_TOKEN`.

- `npm run deploy:release`
  - Orchestrates `deploy:preflight`, `verify:ci`, `db:backup`, `db:migrate`, `db:integrity` and optional smoke tests.
  - Supports `--skip-backup`, `--skip-build`, `--skip-smoke` and `--base-url`.

- `npm run ops:predeploy`
  - Lightweight predeployment command for checking config, backup dry-run and integrity JSON.

## Added files

- `scripts/deploy-utils.mjs`
- `scripts/deploy-preflight.mjs`
- `scripts/db-backup.mjs`
- `scripts/postdeploy-smoke.mjs`
- `scripts/deploy-release.mjs`
- `tests/deploymentOperations.test.ts`
- `docs/PRODUCTION_OPERATION_CHECKLIST.md`

## Environment variables

Added to `.env.example`:

```txt
DATABASE_BACKUP_DIR=backups
DATABASE_BACKUP_RETENTION_DAYS=30
DEPLOY_BASE_URL=https://your-domain.example
DEPLOY_SMOKE_TIMEOUT_MS=8000
DEPLOY_SMOKE_AUTH_TOKEN=
```

## Recommended production workflow

```bash
npm ci
npm run deploy:preflight
npm run verify:ci
npm run db:backup -- --label=predeploy
npm run db:migrate
npm run db:integrity
npm run deploy:smoke -- --base-url=https://your-domain.example
```

Or, for a single orchestration command:

```bash
DEPLOY_BASE_URL=https://your-domain.example npm run deploy:release
```

## Rollback

See `docs/PRODUCTION_OPERATION_CHECKLIST.md`. The rollback process records the predeploy SQL backup path and separates application rollback from database restore so reversible application-only rollbacks do not unnecessarily restore data.

## Verification

Phase 11 validation should include:

```bash
npm run deploy:preflight -- --json --strict=false
npm run db:backup -- --dry-run
npm run lint
npm run test:ci
npm run build
npm run bundle:budget
npm run audit
```
