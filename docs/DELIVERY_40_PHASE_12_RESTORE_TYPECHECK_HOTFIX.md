# Delivery 40 - Phase 12 restore typecheck hotfix

## Summary

This hotfix corrects the TypeScript errors reported after running `npm run verify:ci` on Phase 12.

## Root cause

`server/backupRestore.ts` and `tests/backupRestore.test.ts` call helper functions from `scripts/db-restore-utils.mjs` with these option shapes:

- `inspectSqlBackup({ filePath })`
- `createRestorePlan({ inspection, db })`

Because `tsconfig.json` has `allowJs: true`, TypeScript infers function signatures from `.mjs` files during `tsc --noEmit`. The restore utility lacked explicit JSDoc parameter types, so TypeScript inferred narrower option types and rejected valid call sites.

## Changes

- Added explicit JSDoc typedefs for restore utility inputs and outputs:
  - `SqlBackupInspection`
  - `RestoreDbConfig`
  - `RestorePlanOptions`
- Added explicit JSDoc parameter typing for:
  - `inspectSqlBackup()`
  - `createRestorePlan()`
- Updated restore tests with a complete DB config fixture including `connectTimeout`.
- Updated restore tests to include `preview` in manually constructed inspection fixtures.
- Improved `npm run db:restore -- --list --json` to include `backupDir`.
- Improved missing-backup JSON output for `npm run db:restore -- --backup=<name> --inspect --json`.

## Note about backup listing

`npm run db:restore -- --list --json` returning an empty array is valid when the managed `backups/` directory does not contain `.sql` backups yet.

To create a real backup first, run:

```bash
npm run db:backup -- --label=manual
npm run db:restore -- --list
```

Then inspect one of the returned files:

```bash
npm run db:restore -- --backup=<returned-file.sql> --inspect
```

The earlier `powergym_phase12_sample.sql` command was only a sandbox verification fixture; it is not expected to exist on a local checkout unless you create or copy such a file into the managed backup directory.

## Verification

Run locally:

```bash
npm ci
npm run verify:ci
npm run db:restore -- --list --json
```
