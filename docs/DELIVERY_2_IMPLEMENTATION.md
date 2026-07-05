# Delivery 2 Implementation Report

## Scope

Delivery 2 implements the backend foundation for **Membership & Subscription Management**. It extends the audit-fixed Delivery 1 package with structured MySQL tables, protected Express API routes, and a frontend API client that can be used in the next UI migration pass.

## Implemented items

### Database

Added `sql/002_membership_subscription_schema.sql` with these tables:

- `subscription_plans` for reusable membership plans and pricing.
- `member_subscriptions` for member plan history and active subscriptions.
- `invoices` for subscription billing records.
- `access_tokens` for QR/e-card access validation using hashed tokens.

The server also creates these tables at runtime when the membership API is first used, so local development can start quickly. Production environments should still run migrations explicitly.

### Cross-platform migration script

Added `scripts/apply-migrations.mjs` and updated package scripts:

```bash
npm run db:migrate
npm run db:schema
```

This replaces the previous shell-only MySQL command and works better on Windows, macOS, and Linux.

### API routes

Added `server/membership.ts` and registered it in `server.ts` after authentication middleware.

Implemented protected routes:

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/membership/plans` | List membership plans |
| POST | `/api/membership/plans` | Create a plan |
| PUT | `/api/membership/plans/:id` | Update a plan |
| GET | `/api/membership/members` | List/search members |
| POST | `/api/membership/members` | Create a member |
| GET | `/api/membership/members/:id` | Read member with subscriptions and invoices |
| PUT | `/api/membership/members/:id` | Update a member |
| DELETE | `/api/membership/members/:id` | Archive a member |
| POST | `/api/membership/members/:id/subscriptions` | Create/renew a subscription and optional invoice |
| GET | `/api/membership/members/:id/subscriptions` | List member subscription history |
| GET | `/api/membership/invoices` | List invoices |
| POST | `/api/membership/invoices/:id/mark-paid` | Mark invoice paid |
| POST | `/api/membership/members/:id/access-token` | Generate QR/e-card access token |
| POST | `/api/membership/validate-access` | Validate QR/e-card token and active subscription |

Write operations require one of these roles in the JWT session:

- `super_admin`
- `admin`
- `manager`

### QR/e-card security

Generated QR/e-card tokens are returned once to the client and stored only as SHA-256 hashes in MySQL. The validation endpoint hashes the presented token and checks:

- token exists,
- token is active,
- token is not revoked,
- token is not expired,
- member is active,
- member has an active subscription for the current date.

### Frontend integration preparation

Added `src/lib/membershipApi.ts`, a typed frontend API wrapper for the new backend routes. This prepares Delivery 3 for replacing the current Firebase member/subscription screens with the MySQL-backed API.

## Verification performed

The code changes were verified with:

```bash
npm run verify
npm audit
```

Expected results:

- TypeScript check passes.
- Production build passes.
- Dependency audit reports zero vulnerabilities.
- Production server smoke test confirms `/api/health` works without database configuration and `/api/membership/plans` is protected with HTTP 401 when unauthenticated.

## Notes and limitations

- This delivery adds backend capability and a client wrapper; it does not yet replace the existing member UI screens.
- A real MySQL server is required to execute `npm run db:migrate` and exercise the new endpoints.
- Existing Firebase-based screens remain available while the backend migration is completed incrementally.

## Recommended next delivery

Delivery 3 should connect the UI to the new membership backend:

1. Replace Firebase member CRUD calls with `membershipApi`.
2. Add plan management UI.
3. Add subscription renewal flow using `/api/membership/members/:id/subscriptions`.
4. Add QR/e-card generation and validation UI.
5. Add invoice list and paid/unpaid status actions.
