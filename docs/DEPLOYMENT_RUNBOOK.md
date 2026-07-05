# PowerGym Management – Production Deployment Runbook

This runbook is the operational companion to `docs/PRODUCTION_OPERATION_CHECKLIST.md`.

## 1. Prepare environment variables

Create a production `.env` file from `.env.example` and set at minimum:

```txt
NODE_ENV=production
PORT=3000
JWT_SECRET=<long-random-secret>
DATABASE_HOSTNAME=<mysql-host>
DATABASE_USER_NAME=<mysql-user>
DATABASE_PASSWORD=<mysql-password>
DATABASE_NAME=powergym
ADMIN_SETUP_TOKEN=<one-time-setup-token>
ALLOWED_ORIGINS=https://your-domain.example
PASSWORD_RESET_TOKEN_PEPPER=<long-random-reset-pepper>
PASSWORD_RESET_PUBLIC_BASE_URL=https://your-domain.example
PASSWORD_RESET_EXPOSE_DEV_TOKEN=false
DATABASE_BACKUP_DIR=backups
DATABASE_BACKUP_RETENTION_DAYS=30
DEPLOY_BASE_URL=https://your-domain.example
```

Do not commit `.env` files to source control.

## 2. Install and verify

```bash
npm ci
npm run deploy:preflight
npm run verify:ci
npm run db:integrity
```

`deploy:preflight` blocks critical production configuration mistakes such as missing database credentials, weak secrets, missing HTTPS origins or reset token preview enabled in production.

## 3. Backup before database migrations

```bash
npm run db:backup -- --label=predeploy
```

The backup command uses `mysqldump` and writes a `.sql` file into `DATABASE_BACKUP_DIR` or `backups` by default.

Dry-run:

```bash
npm run db:backup -- --dry-run
```

## 4. Apply database migrations

```bash
npm run db:migrate
npm run db:integrity
```

Seed files are skipped by default. To load demo data in a non-production environment, run:

```bash
npm run db:seed
```

## 5. Build and start

```bash
npm run build
npm start
```

Health endpoint:

```txt
GET /api/health
```

Authenticated database health endpoint:

```txt
GET /api/db-health
```

## 6. Post-deployment smoke tests

```bash
npm run deploy:smoke -- --base-url=https://your-domain.example
```

Optional authenticated DB smoke:

```bash
DEPLOY_SMOKE_AUTH_TOKEN=<token> npm run deploy:smoke -- --base-url=https://your-domain.example --include-db
```

## 7. One-command release orchestration

For environments where the app host and database are accessible from the same runner:

```bash
DEPLOY_BASE_URL=https://your-domain.example npm run deploy:release
```

Useful flags:

```bash
npm run deploy:release -- --skip-backup
npm run deploy:release -- --skip-build
npm run deploy:release -- --skip-smoke
npm run deploy:release -- --base-url=https://your-domain.example
```

## 8. Docker deployment

Build image:

```bash
docker build -t powergym-management:latest .
```

Run container:

```bash
docker run --env-file .env -p 3000:3000 powergym-management:latest
```

## 9. Create or confirm super admin

Call the protected setup endpoint after the app starts:

```bash
curl -H "x-admin-setup-token: <ADMIN_SETUP_TOKEN>" https://your-domain.example/api/admin-setup
```

Then rotate/remove the setup token if your operational policy requires one-time bootstrap only.

## 10. Manual smoke checklist

After login as admin, verify:

1. Dashboard opens.
2. Membership, scheduling, HR, accounting, settings and support pages load.
3. Generate e-card token works for an active member with a future subscription expiry.
4. A filtered PDF report downloads.
5. Settings > Security Center shows operational metrics.
6. Settings > Data Integrity Center shows checks.
7. `/api/health` returns OK or an expected degraded state during planned database work.
8. Password reset request returns a generic response and delivery is logged.

## 11. Backup and recovery

Use both layers:

1. Application-level SQL backup: `npm run db:backup -- --label=predeploy`.
2. Managed MySQL backup from the hosting provider.

For rollback details, use `docs/PRODUCTION_OPERATION_CHECKLIST.md`.

## Phase 12 - Managed restore workflow

Use restore only during a maintenance window. The UI supports backup inspection and dry-run; production apply should normally be done from CLI.

```bash
npm run db:backup -- --label=pre_restore
npm run db:restore -- --backup=<backup.sql> --inspect
npm run db:restore -- --backup=<backup.sql>
npm run db:restore -- --backup=<backup.sql> --apply --confirm=RESTORE --allow-destructive
npm run db:integrity -- --json
npm run deploy:smoke -- --base-url=https://your-domain.example --include-db
```

Production restores are blocked unless explicitly enabled with `DATABASE_RESTORE_ALLOW_PRODUCTION=true` or `--allow-production-restore`.
