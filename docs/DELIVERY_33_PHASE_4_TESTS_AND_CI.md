# Delivery 33 - Phase 4 Tests and CI

## Scope

Phase 4 adds an automated verification layer for the hardening and PDF reporting work delivered in Phases 1-3.

## Added scripts

- `npm run test` - runs Node's built-in test runner through `tsx` for the TypeScript test files.
- `npm run test:ci` - runs the same tests with the `spec` reporter for CI logs.
- `npm run audit` - runs `npm audit --audit-level=moderate`.
- `npm run verify:ci` - runs typecheck, tests, production build and audit in one command.

## Added test coverage

### RBAC

File: `tests/rbac.test.ts`

- Confirms permission grants and denials for super admin, admin, manager, accounting, trainer, reception and client roles.
- Confirms unknown/missing roles are denied.
- Confirms hierarchy checks for minimum roles.
- Confirms `requirePermission` returns 403 and does not continue unauthorized requests.

### Origin/CSRF guard

File: `tests/originGuard.test.ts`

- Allows safe methods.
- Blocks production mutating requests without origin information.
- Allows configured app origins.
- Allows same-host mutations and blocks foreign origins.

### Screen PDF reports

File: `tests/reports.test.ts`

- Confirms the screen-specific report catalog includes the 14 expected reports.
- Confirms role-specific visibility.
- Confirms date filters, blank/all filter normalization and search trimming.
- Confirms inverted and overlong date ranges are rejected.
- Confirms SQL where clauses use parameter placeholders and do not inline search values.
- Confirms numeric filters reject non-numeric injection-like input.
- Confirms report PDF filenames are stable and predictable.

### Report routes

File: `tests/reports.routes.test.ts`

- Starts a lightweight Express app with the report router.
- Confirms screen catalog output is filtered by role.
- Confirms unauthorized PDF access returns 403 before database access.
- Confirms unknown report IDs return 404.
- Confirms authorized PDF generation returns 503 when MySQL is unavailable.

## CI

File: `.github/workflows/ci.yml`

The GitHub Actions workflow runs on pull requests and pushes to `main`, `master` and `develop`.

Steps:

1. Checkout repository.
2. Setup Node.js 22 with npm cache.
3. Run `npm ci`.
4. Run `npm run verify:ci`.

## Local verification

Run:

```bash
npm ci
npm run verify:ci
```

For faster local checks during development:

```bash
npm run lint
npm run test
```
