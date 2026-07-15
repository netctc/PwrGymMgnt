# Evolution System — Deployment Guide

## Prerequisites

- Node.js 22+
- MySQL 5.7+ or MariaDB 10.3+
- All environment variables configured (see `.env.example`)

## Step-by-Step Deployment

### 1. Apply Database Migrations

```bash
npm run db:migrate
```

This creates 11 new tables. Idempotent — safe to run multiple times.

### 2. Backfill Existing Data

```bash
# Preview (no changes)
npm run db:backfill-v2:dry

# Execute migration
npm run db:backfill-v2
```

Migrates `member_subscriptions` → `subscriptions` + `affiliations` + `plan_versions`.
Tracks progress in `migration_mappings` table. Re-runnable (skips already migrated).

### 3. Initialize Users (if needed)

```bash
npm run db:init-users
```

### 4. Start the Server

```bash
npm run dev        # Development
npm run start      # Production (after build)
```

Workers start automatically: cycle closing, outbox drain, reservation expiry (every 60s).

### 5. Activate Features Gradually

Navigate to `/subscriptions?tab=flags` or run SQL:

```sql
-- Phase 1: Enable new subscription model (plan versions, subscriptions, affiliations)
UPDATE feature_flags SET enabled = 1 WHERE flag_key = 'ENABLE_NEW_SUBSCRIPTION_MODEL';

-- Phase 2: Enable session ledger (limited plans consume sessions)
UPDATE feature_flags SET enabled = 1 WHERE flag_key = 'ENABLE_SESSION_LEDGER';

-- Phase 3: Enable multiple affiliations per member
UPDATE feature_flags SET enabled = 1 WHERE flag_key = 'ENABLE_MULTI_AFFILIATION';

-- Phase 4: Enable multi-user plans (family/group/corporate)
UPDATE feature_flags SET enabled = 1 WHERE flag_key = 'ENABLE_MULTI_USER_PLANS';

-- Phase 5: Enable unified access motor (replaces legacy QR validation)
UPDATE feature_flags SET enabled = 1 WHERE flag_key = 'ENABLE_UNIFIED_ACCESS';

-- Phase 6: Enable facial recognition (requires hardware + consent)
UPDATE feature_flags SET enabled = 1 WHERE flag_key = 'ENABLE_FACIAL_ACCESS';
```

## Rollback

To disable any feature without data loss:
```sql
UPDATE feature_flags SET enabled = 0 WHERE flag_key = 'ENABLE_...';
```

The system falls back to legacy behavior automatically.

## New Pages

| URL | Function |
|-----|----------|
| `/subscriptions` | Plan versions, subscriptions, affiliations, feature flags |
| `/access-control` | Validate access, history, access points |
| `/biometrics` | Facial profiles, consent, enrollment |
| `/evolution` | System metrics dashboard |

## New API Endpoints (Summary)

### Subscriptions V2
- `GET/POST /api/v2/plan-versions`
- `GET/POST /api/v2/subscriptions`
- `GET/POST/DELETE /api/v2/subscriptions/:id/members`
- `POST /api/v2/subscriptions/:id/freeze|suspend|reactivate|cancel|renew|change-plan`
- `GET /api/v2/affiliations`
- `GET /api/v2/session-balances`
- `GET /api/v2/session-movements`
- `POST /api/v2/sessions/consume|reserve|refund|adjust`
- `POST /api/v2/sessions/reconcile`
- `GET/PUT /api/v2/feature-flags`

### Access Control
- `POST /api/access/authorize`
- `GET /api/access/attempts`
- `GET/POST /api/access/points`

### Biometrics
- `POST/GET /api/biometrics/consents`
- `POST/GET /api/biometrics/profiles`
- `POST /api/biometrics/profiles/:id/revoke|delete`
- `GET /api/biometrics/deletion-jobs`

### Dashboard & Workers
- `GET /api/v2/dashboard/summary|access-trends|top-consumers`
- `POST /api/v2/workers/run-cycles|drain-outbox|release-expired`

## Health Checks

```bash
# Verify balance integrity
curl -X POST http://localhost:3000/api/v2/sessions/reconcile

# Force cycle processing
curl -X POST http://localhost:3000/api/v2/workers/run-cycles

# Check dashboard metrics
curl http://localhost:3000/api/v2/dashboard/summary
```

## Production Considerations

1. **Connection Pool**: Increase `DATABASE_CONNECTION_LIMIT` if access volume is high
2. **Workers**: Run on single instance or use distributed locking (already implemented via MySQL GET_LOCK)
3. **Outbox**: Currently logs events. To add email/webhook delivery, extend `drainOutbox()` in `server/workers.ts`
4. **Biometrics**: Requires external biometric service. `template_reference` is an opaque pointer — actual templates never stored in PowerGym DB
5. **Backup**: Evolution tables are included in the daily backup cron
