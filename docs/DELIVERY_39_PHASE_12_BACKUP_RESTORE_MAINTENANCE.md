# Delivery 39 - Phase 12 Backup Restore and Managed Maintenance

## Scope

Phase 12 adds a controlled backup restore workflow on top of the Phase 11 backup and deployment tools. The goal is to make restore operations inspectable, auditable, and hard to run accidentally, especially in production.

## Implemented files

- `scripts/db-restore-utils.mjs`
- `scripts/db-restore.mjs`
- `server/backupRestore.ts`
- `tests/backupRestore.test.ts`
- `tests/backupRestore.routes.test.ts`
- `src/pages/Settings.tsx`
- `server/rbac.ts`
- `server.ts`
- `.env.example`
- `package.json`

## New npm scripts

```bash
npm run db:restore -- --list
npm run db:restore -- --backup=powergym_predeploy_2026-06-08T13-00-00-000Z.sql --inspect
npm run db:restore -- --backup=powergym_predeploy_2026-06-08T13-00-00-000Z.sql
npm run db:restore -- --backup=powergym_predeploy_2026-06-08T13-00-00-000Z.sql --apply --confirm=RESTORE --allow-destructive
npm run ops:restore:dry-run -- --backup=powergym_predeploy_2026-06-08T13-00-00-000Z.sql
npm run ops:maintenance
```

By default, `db:restore` runs inspection/dry-run only. Apply mode requires an explicit `--apply --confirm=RESTORE` pair.

## API endpoints

All endpoints require `platform.backups.restore`, which is limited to `super_admin`.

- `GET /api/platform/backups/restore/backups`
- `GET /api/platform/backups/restore/backups/:name/inspect`
- `POST /api/platform/backups/restore/plan`
- `POST /api/platform/backups/restore/execute`

The UI uses inspection and dry-run mode only. Apply mode is intentionally gated by backend configuration and should be used during a maintenance window.

## Restore safety controls

The restore validator checks:

- managed backup filename only, no paths,
- SQL file exists in the configured backup directory,
- empty file rejection,
- SHA-256 hash calculation,
- metrics for CREATE/ALTER/INSERT/DROP/TRUNCATE/DELETE statements,
- hard block for DROP DATABASE/SCHEMA and user/permission statements,
- destructive table statements require `--allow-destructive`,
- production restore requires `--allow-production-restore` or `DATABASE_RESTORE_ALLOW_PRODUCTION=true`,
- API apply mode requires `DATABASE_RESTORE_API_ENABLED=true`,
- database environment variables must be present.

## Environment variables

```bash
DATABASE_RESTORE_API_ENABLED=false
DATABASE_RESTORE_ALLOW_PRODUCTION=false
DATABASE_RESTORE_ALLOW_DESTRUCTIVE=false
```

Recommended production defaults keep API apply disabled. Use CLI restore from a trusted operator shell unless there is a strong operational reason to enable API apply.

## Managed backup name compatibility

The legacy `/api/backups` routes now accept the safer generalized `.sql` pattern used by both:

- app-created backups: `backup-manual-...sql`
- Phase 11 CLI backups: `powergym_predeploy_...sql`

This fixes the mismatch where CLI backups were created successfully but did not appear in the UI/API backup list.

## Recommended restore procedure

1. Announce maintenance window and stop write traffic if possible.
2. Take a fresh backup:

```bash
npm run db:backup -- --label=pre_restore
```

3. Inspect the selected backup:

```bash
npm run db:restore -- --backup=<backup.sql> --inspect
```

4. Run a dry-run plan:

```bash
npm run db:restore -- --backup=<backup.sql>
```

5. Apply only after review:

```bash
npm run db:restore -- --backup=<backup.sql> --apply --confirm=RESTORE --allow-destructive
```

6. Run verification:

```bash
npm run db:integrity -- --json
npm run deploy:smoke -- --base-url=https://your-domain.example --include-db
```

## Verification

In the sandbox, dependency installation was interrupted before `tsx`/Express were available. The restore utility files were still syntax checked and smoke tested directly with Node:

```bash
node --check scripts/db-restore-utils.mjs
node --check scripts/db-restore.mjs
node --input-type=module <restore-utils smoke test>
```

Run the full suite in a normal environment:

```bash
npm ci
npm run verify:ci
npm run db:restore -- --list
```
