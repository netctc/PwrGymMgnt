# PowerGym Implementation Roadmap - 10 Phases

This roadmap converts the technical and functional review into an executable delivery plan. The sequencing is intentionally foundation-first: security, typed APIs, performance, observability and localization architecture are prerequisites for safe feature expansion.

## Phase 1 - Foundation hardening and delivery governance

**Objective:** Reduce the highest platform risks before adding new features.

**Scope**
- Add a delivery tracker and release checklist for each phase.
- Lock down deprecated compatibility access paths and force production opt-in.
- Add safe pagination defaults to legacy `/api/records/*` reads.
- Add deprecation headers to legacy compatibility responses.
- Define phase-level acceptance criteria and verification evidence.

**Acceptance criteria**
- `/api/records/*` is disabled by default in production unless `ENABLE_COMPAT_RECORDS_API=true` is explicitly configured.
- Legacy reads default to paginated results with a hard maximum limit.
- Tests cover compatibility API enablement, pagination and deprecation headers.
- `.env.example` documents the migration controls.

**Status:** Started in this implementation package.

## Phase 2 - RBAC and authorization completeness

**Objective:** Ensure every sensitive read/write operation has explicit backend permission checks.

**Status:** Started in Delivery 50 with backend write/read guard hardening, JWT role validation, a route-permission matrix, and frontend permission-based navigation.

**Scope**
- Inventory all backend routes and map each one to a permission.
- Add missing read-side guards for membership, HR, finance, scheduling, reports, warehouse and engagement routes.
- Add negative authorization tests for all role boundaries.
- Align frontend navigation visibility with backend permissions.

**Acceptance criteria**
- Route-permission matrix is complete.
- Unauthorized roles receive 403 before database access.
- Client-side route guards mirror backend permission names.

## Phase 3 - Typed domain API migration

**Status:** Started in Delivery 51 with typed dashboard contracts, backend dashboard endpoints, frontend typed API clients, and compatibility consumer inventory.

**Objective:** Replace generic Firestore-style compatibility access with typed, permission-scoped APIs.

**Scope**
- Identify all `src/lib/firestore-sql-shim.ts` consumers.
- Build typed domain clients for members, staff, settings, scheduling and remaining legacy collections.
- Add request/response DTO validation with Zod.
- Migrate frontend screens away from `/api/records/*`.

**Acceptance criteria**
- No production screen depends on `/api/records/*`.
- Compatibility API can remain disabled in staging/production.
- Domain API responses are paginated and validated.

## Phase 4 - Architecture modularization

**Status:** Started in Delivery 52 with centralized route module registration and isolated compatibility records routes.

**Objective:** Improve maintainability by separating route, controller, service and repository responsibilities.

**Scope**
- Split large backend files, especially warehouse, finance, reports and membership.
- Introduce shared error, validation, pagination and audit utilities.
- Define module boundaries and dependency rules.
- Add lightweight architecture documentation and module ownership notes.

**Acceptance criteria**
- Large modules are decomposed without changing public behavior.
- Reusable utilities replace duplicated SQL/error handling patterns.
- Tests confirm route behavior remains stable.

## Phase 5 - Performance and database access optimization

**Objective:** Improve response times and resilience on production-size datasets.

**Scope**
- Add server-side pagination, filtering and sorting to all heavy list screens.
- Profile report, dashboard, membership and warehouse queries.
- Add missing indexes for common filters and joins.
- Introduce bounded caching for low-risk aggregate endpoints.

**Acceptance criteria**
- Heavy screens never request unbounded lists.
- Query plans are documented for critical reports.
- Bundle-budget and server response baselines are tracked.

## Phase 6 - Observability, logging and auditability

**Objective:** Make user actions, system events and operational failures traceable.

**Scope**
- Define a standard audit event taxonomy.
- Add correlation IDs to logs and audit records.
- Centralize structured logging and error reporting.
- Add metrics and alerts for authentication, permissions, backups, reports and database health.

**Acceptance criteria**
- Critical create/update/delete and privileged read events produce audit entries.
- Every API request has a correlation ID.
- Operational dashboards and alert thresholds are documented.

## Phase 7 - Security expansion

**Objective:** Move from baseline security to enterprise-grade controls.

**Scope**
- Complete or remove placeholder Google OAuth behavior.
- Add MFA for privileged roles.
- Add session revocation and device/session listing.
- Harden password reset, admin bootstrap and privileged actions.
- Add security regression tests and deployment checks.

**Acceptance criteria**
- Admin and finance/security roles can require MFA.
- Revoked sessions are rejected server-side.
- Privileged actions are audited with actor, target and context.

## Phase 8 - Multilingual and localization foundation

**Objective:** Prepare the application for Arabic RTL and French end-to-end.

**Scope**
- Introduce an i18n framework and translation key conventions.
- Move hardcoded UI strings into locale catalogs.
- Add locale-aware number, currency, date and PDF formatting.
- Add RTL layout support and visual regression checklist.
- Prepare translated notification and receipt templates.

**Acceptance criteria**
- Locale can switch between English, French and Arabic.
- RTL layout is applied globally for Arabic.
- Reports, receipts and core forms use localized formatting.

## Phase 9 - Best-in-class functional enhancements

**Objective:** Add the features that move the product beyond core operations.

**Scope**
- Membership: portal, online payments, freeze/hold workflows, family/corporate plans.
- Scheduling: waitlists, recurring templates, trainer availability and no-show workflows.
- Finance: chart of accounts, double-entry ledger, bank reconciliation, VAT/tax and close workflow.
- Warehouse/POS: returns/refunds, transfers, barcode labels, offline POS and supplier scoring.
- HR: leave requests, documents, payslips and staff portal.

**Acceptance criteria**
- Each domain feature has a documented workflow, migration, API contract and tests.
- Finance/POS/accounting flows produce auditable ledger effects.

## Phase 10 - Cloud readiness, API-first operation and production excellence

**Status:** Implemented in Delivery 58.

**Objective:** Prepare the platform for scalable production growth.

**Scope**
- Complete OpenAPI coverage and contract tests.
- Add deployment promotion process and rollback playbooks.
- Externalize backups and validate disaster recovery drills.
- Define SLA/SLO metrics and operational ownership.
- Package API-first integrations, webhooks and future modular upgrades.

**Acceptance criteria**
- Production release checklist is repeatable.
- Backup/restore drills have evidence.
- API documentation and contracts match deployed behavior.

## Phase delivery rule

Each phase should produce:
1. Code changes.
2. Database migrations where needed.
3. Tests or verification logs.
4. User-facing documentation or release notes.
5. A short risk/rollback note.
