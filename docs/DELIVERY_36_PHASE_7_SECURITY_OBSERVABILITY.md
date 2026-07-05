# Delivery 36 - Phase 7 Security Observability and Administration

## Scope

Phase 7 extends the Phase 6 password reset delivery implementation with an operational Security Center for administrators, super administrators, and managers.

The goal is to make sensitive system behavior visible without exposing secrets such as reset tokens or token hashes.

## Backend changes

### RBAC

Added a dedicated permission:

- `platform.security.observe`

Allowed roles:

- `super_admin`
- `admin`
- `manager`

Platform security routes now check this permission instead of relying on ad hoc role checks.

### New/expanded endpoints

#### `GET /api/platform/security/overview`

Returns bounded security observability data for a selected range:

- total API requests
- warning count
- 5xx error count
- 401/403 denied access count
- average API duration
- maximum API duration
- password reset delivery totals
- password reset completion/revocation/expiration totals
- grouped severity data
- grouped module data
- top denied access paths
- slowest API requests
- top actors with masked identities
- calculated alerts

Query parameters:

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

The route enforces a maximum 90-day range.

#### `GET /api/platform/security/alerts`

Returns only calculated alerts for the selected range.

Alert types include:

- server error spikes
- access denial spikes
- password reset delivery failures
- slow API response patterns
- positive security posture when no thresholds are exceeded

#### `GET /api/platform/security/password-reset-deliveries`

Returns reset delivery history without token hashes or raw tokens.

Query parameters:

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`
- `status=all|sent|failed|skipped`
- `channel=all|email|sms`
- `email=<partial email>`
- `limit=<number>`

Sensitive fields intentionally excluded:

- `token_hash`
- raw reset token

Email identities are masked in responses.

#### `GET /api/platform/security/overview.csv`

Exports security KPIs and alert summaries as CSV for operations review and external evidence.

## Database migration

Added:

- `sql/014_security_observability_indexes.sql`

Indexes added idempotently:

- `idx_security_audit_range_status`
- `idx_security_audit_range_module_severity`
- `idx_password_reset_created_delivery`

These indexes support the new Security Center filters and summary calculations.

## Frontend changes

### Settings / Security & Reports

The existing Settings security tab now acts as a Security Center with:

- date range filters
- reset delivery status filter
- refresh action
- CSV export action
- security KPI cards
- system health card
- API cache card
- access-denial summary
- calculated security alerts
- top denied access table
- slowest API requests table
- password reset delivery history table
- operations summary using the same selected range

The Settings route and navigation now allow:

- `super_admin`
- `admin`
- `manager`

## Tests added

Added:

- `tests/platformSecurity.test.ts`
- `tests/platformSecurity.routes.test.ts`

Coverage includes:

- bounded date range normalization
- alert severity calculations
- positive posture alert generation
- email masking
- permission denial for unauthorized roles
- 503 when the database is unavailable
- password reset delivery history does not expose token hashes

## Verification

Executed successfully:

```bash
npm ci --ignore-scripts
npm run lint
npm run test:ci
npm run build
npm run audit
```

Results:

- `lint`: OK
- `test:ci`: OK, 35/35 tests
- `build`: OK
- `audit`: OK, 0 vulnerabilities

Build warning still present:

- Vite warns that the main app chunk is larger than 500 KB.
- This is not a failure, but should be addressed in a future performance/code-splitting phase.

## Recommended next phase

Phase 8 should focus on performance and bundle optimization:

- route-level lazy loading
- manual Rollup chunks for heavy libraries
- lazy loading reports/PDF libraries
- splitting charts from core screens
- reducing initial JS payload
