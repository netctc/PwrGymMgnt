# Delivery 41 - Phase 12 Backup Client Path Hotfix

## Purpose

This hotfix improves the local backup and restore scripts when the MySQL client binaries are not installed or are not available in the operating system PATH.

## Fixed issues

- `npm run db:backup` previously created a 0-byte `.sql` file if `mysqldump` could not be started.
- The missing `mysqldump` error surfaced as a raw Node.js `spawn mysqldump ENOENT` stack trace.
- Restore apply could fail similarly if the `mysql` client executable was missing.
- `npm run db:restore -- --list` did not clearly mark empty backup files as invalid.

## Changes

- `scripts/db-backup.mjs`
  - Supports `--mysqldump=<path>`.
  - Supports `MYSQLDUMP_PATH` from environment.
  - Deletes partial/empty backup files when `mysqldump` cannot start or exits unsuccessfully.
  - Prints Windows-specific setup examples instead of a raw stack trace.

- `scripts/db-restore.mjs`
  - Supports `--mysql=<path>`.
  - Supports `MYSQL_PATH` from environment.
  - Prints a clear missing mysql-client message if restore apply cannot start the `mysql` executable.
  - Marks 0-byte backup files as invalid in plain-text list output.

- `.env.example`
  - Documents `MYSQLDUMP_PATH` and `MYSQL_PATH`.

## Windows usage

If MySQL client tools are installed but not in PATH, use either an inline path:

```bash
npm run db:backup -- --label=manual --mysqldump="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
```

or set an environment variable:

```bat
set MYSQLDUMP_PATH=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe
set MYSQL_PATH=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe
```

Then run:

```bash
npm run db:backup -- --label=manual
npm run db:restore -- --list
npm run db:restore -- --backup=<actual-file-name.sql> --inspect
```

Do not copy `<actual-file-name.sql>` literally. Replace it with the file name returned by `npm run db:restore -- --list`.

## Verification

Performed syntax and behavior checks for:

- `node --check scripts/db-backup.mjs`
- `node --check scripts/db-restore.mjs`
- missing `mysqldump` cleanup behavior
- missing `mysql` restore behavior
