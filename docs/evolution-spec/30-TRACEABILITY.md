# 30 — Traceability Matrix

## Overview

This matrix traces each requirement from business rule through API endpoint, database table, and test coverage. Ensures no requirement is orphaned and every implementation element has a traced origin.

## Requirement → API → Table → Test

### Session & Access Rules

| Req ID | Requirement | API Endpoint(s) | Table(s) | Test File(s) |
|--------|-------------|-----------------|----------|-------------|
| BR-09 | Session balance cannot go negative | `POST /api/v2/access/authorize` | `session_ledger`, `balance_cache` | `unit/business-rules/sessionRules.test.ts`, `integration/concurrency/parallelDebit.test.ts` |
| BR-10 | Debit must be atomic | `POST /api/v2/access/authorize` | `session_ledger`, `affiliations` | `integration/concurrency/parallelDebit.test.ts` |
| BR-11 | Duplicate entry prevention | `POST /api/v2/access/authorize` | `access_attempts` | `unit/services/duplicateEntry.test.ts`, `integration/api/access.routes.test.ts` |
| BR-12 | Access denied if no active affiliation | `POST /api/v2/access/authorize` | `affiliations` | `integration/api/access.routes.test.ts` |
| BR-13 | Facial confidence ≥ 0.85 | `POST /api/v2/access/authorize` | `access_attempts` | `unit/services/confidenceThreshold.test.ts` |
| BR-14 | Liveness check mandatory | `POST /api/v2/access/authorize` | `access_attempts` | `integration/api/access.routes.test.ts` |
| BR-15 | Manual override requires reason | `POST /api/v2/access/authorize` | `access_attempts` | `integration/api/access.routes.test.ts` |
| BR-16 | Timeout triggers compensation | Device gateway event | `session_ledger`, `access_attempts` | `integration/device/gatewayProtocol.test.ts` |

### Subscription & Plan Rules

| Req ID | Requirement | API Endpoint(s) | Table(s) | Test File(s) |
|--------|-------------|-----------------|----------|-------------|
| BR-01 | Max 3 subscriptions as holder | `POST /api/v2/subscriptions` | `subscriptions` | `unit/business-rules/subscriptionRules.test.ts`, `integration/api/subscriptions.routes.test.ts` |
| BR-02 | Max 5 subscriptions as beneficiary | `POST /api/v2/subscriptions/:id/members` | `subscription_members` | `unit/business-rules/subscriptionRules.test.ts` |
| BR-03 | Exactly 1 holder per subscription | `POST /api/v2/subscriptions` | `subscription_members` | `unit/business-rules/subscriptionRules.test.ts` |
| BR-04 | Only active plans for new subs | `POST /api/v2/subscriptions` | `plans`, `subscriptions` | `integration/api/subscriptions.routes.test.ts` |
| BR-05 | Cannot exceed max_beneficiaries | `POST /api/v2/subscriptions/:id/members` | `subscription_members`, `plans` | `integration/api/subscriptions.routes.test.ts` |
| BR-06 | No duplicate person in subscription | `POST /api/v2/subscriptions/:id/members` | `subscription_members` | `integration/api/subscriptions.routes.test.ts` |
| BR-07 | Immutable active plan version | `PATCH /api/v2/plans/:id` | `plans` | `integration/api/plans.routes.test.ts` |
| BR-08 | 30-day sunset window | `POST /api/v2/plans/:id/archive` | `plans` | `unit/state-machines/plan.test.ts` |

### Affiliation Rules

| Req ID | Requirement | API Endpoint(s) | Table(s) | Test File(s) |
|--------|-------------|-----------------|----------|-------------|
| BR-17 | Max 5 active affiliations | Subscription activation flow | `affiliations` | `unit/business-rules/affiliationRules.test.ts` |
| BR-18 | Freeze independence | `POST /api/v2/affiliations/:id/freeze` | `affiliations`, `affiliation_status_log` | `integration/api/affiliations.routes.test.ts` |
| BR-19 | 60-day freeze cooldown | `POST /api/v2/affiliations/:id/freeze` | `affiliations` | `unit/business-rules/affiliationRules.test.ts` |
| BR-20 | Max freeze duration (plan-defined) | `POST /api/v2/affiliations/:id/freeze` | `affiliations`, `plans` | `unit/business-rules/affiliationRules.test.ts` |
| BR-21 | Global block suspends all | `POST /api/v2/persons/:id/block` | `affiliations`, `persons` | `integration/api/affiliations.routes.test.ts` |

### Cycle & Billing Rules

| Req ID | Requirement | API Endpoint(s) | Table(s) | Test File(s) |
|--------|-------------|-----------------|----------|-------------|
| BR-22 | Carryover cap (50% or 10) | Cycle close scheduler | `session_ledger`, `cycles` | `unit/services/carryoverCalculation.test.ts` |
| BR-23 | Carryover expires in 30 days | Daily scheduler | `session_ledger` | `unit/services/carryoverCalculation.test.ts` |
| BR-24 | 7-day grace period | Cycle state machine | `cycles`, `subscriptions` | `unit/state-machines/cycle.test.ts` |
| BR-25 | 30-day renewal window | `POST /api/v2/subscriptions/:id/renew` | `subscriptions`, `cycles` | `integration/api/subscriptions.routes.test.ts` |

### Security & Biometric Rules

| Req ID | Requirement | API Endpoint(s) | Table(s) | Test File(s) |
|--------|-------------|-----------------|----------|-------------|
| BR-26 | Consent required for enrollment | `POST /api/v2/biometric/enroll` | `consent_records`, `biometric_profiles` | `integration/api/biometric.routes.test.ts` |
| BR-27 | Templates encrypted at rest | Storage layer | `biometric_templates` | `security/templateEncryption.test.ts` |
| BR-28 | Deletion within 72 hours | `DELETE /api/v2/biometric/persons/:id/delete` | `biometric_templates`, `biometric_profiles` | `integration/api/biometric.routes.test.ts` |
| BR-29 | No raw images on edge | Edge firmware | N/A (edge device) | `e2e/enrollmentFlow.test.ts` (mock verification) |
| BR-30 | All decisions logged | `POST /api/v2/access/authorize` | `access_attempts` | `integration/api/access.routes.test.ts` |

## API → Table Mapping

| API Endpoint | Primary Table(s) | Secondary Table(s) |
|-------------|-----------------|-------------------|
| `GET /api/v2/plans` | `plans` | — |
| `POST /api/v2/plans` | `plans` | `plan_version_history` |
| `POST /api/v2/plans/:id/publish` | `plans` | `state_transitions` |
| `POST /api/v2/subscriptions` | `subscriptions`, `subscription_members` | `affiliations`, `outbox_events` |
| `POST /api/v2/subscriptions/:id/members` | `subscription_members` | `affiliations` |
| `POST /api/v2/subscriptions/:id/suspend` | `subscriptions` | `affiliations`, `state_transitions` |
| `GET /api/v2/persons/:pid/affiliations` | `affiliations` | `subscriptions`, `plans` |
| `POST /api/v2/affiliations/:id/freeze` | `affiliations` | `affiliation_status_log`, `state_transitions` |
| `POST /api/v2/access/authorize` | `access_attempts` | `session_ledger`, `affiliations`, `balance_cache` |
| `GET /api/v2/affiliations/:id/balance` | `balance_cache` | `session_ledger` |
| `GET /api/v2/affiliations/:id/ledger` | `session_ledger` | — |
| `POST /api/v2/biometric/enroll` | `biometric_profiles` | `consent_records` |
| `DELETE /api/v2/biometric/persons/:id/delete` | `biometric_profiles`, `biometric_templates` | `outbox_events` |
| `GET /api/v2/devices` | `devices` | — |
| `GET /api/v2/subscriptions/:id/cycles` | `cycles` | — |

## Table → Test Coverage

| Table | Unit Tests | Integration Tests | E2E Tests |
|-------|-----------|-------------------|-----------|
| `persons` | — | `migration/dataMigration.test.ts` | — |
| `plans` | `state-machines/plan.test.ts` | `api/plans.routes.test.ts` | — |
| `subscriptions` | `state-machines/subscription.test.ts` | `api/subscriptions.routes.test.ts` | `subscriptionLifecycle.test.ts` |
| `subscription_members` | `business-rules/subscriptionRules.test.ts` | `api/subscriptions.routes.test.ts` | — |
| `affiliations` | `state-machines/affiliation.test.ts` | `api/affiliations.routes.test.ts` | `accessFlow.test.ts` |
| `session_ledger` | `services/balanceCalculation.test.ts` | `concurrency/parallelDebit.test.ts` | `accessFlow.test.ts` |
| `cycles` | `state-machines/cycle.test.ts`, `services/carryover.test.ts` | `api/cycles.routes.test.ts` | `cycleManagement.test.ts` |
| `access_attempts` | — | `api/access.routes.test.ts` | `accessFlow.test.ts` |
| `balance_cache` | — | `concurrency/parallelDebit.test.ts` | — |
| `biometric_profiles` | `state-machines/biometric.test.ts` | `api/biometric.routes.test.ts` | `enrollmentFlow.test.ts` |
| `biometric_templates` | — | `api/biometric.routes.test.ts` | `enrollmentFlow.test.ts` |
| `consent_records` | — | `api/biometric.routes.test.ts` | — |
| `devices` | — | `device/gatewayProtocol.test.ts` | — |
| `outbox_events` | — | `concurrency/outbox.test.ts` | — |
| `idempotency_keys` | `services/idempotency.test.ts` | `concurrency/parallelDebit.test.ts` | — |
| `state_transitions` | — | All state machine integration tests | — |

## Non-Functional Requirements Traceability

| NFR | Verification Method | Test/Metric |
|-----|-------------------|-------------|
| Access latency < 200ms P95 | Performance test | `performance/accessLatency.k6.ts` |
| 99.9% access API uptime | Monitoring | Uptime dashboard alert |
| Database query < 50ms | APM instrumentation | Slow query logging |
| 50 req/sec per branch | Load test | `performance/accessLatency.k6.ts` |
| AES-256 encryption at rest | Security audit | `security/templateEncryption.test.ts` |
| Biometric deletion < 72h | Compliance job | Automated retention check |
| Audit log retention 2 years | Retention policy | Purge job configuration |

## Coverage Gaps (To Address)

| Gap | Risk | Mitigation |
|-----|------|-----------|
| Edge device firmware not directly testable | Medium | Mock simulator + device vendor certification |
| Real facial recognition accuracy | Medium | Quarterly accuracy audit with test subjects |
| Production data migration | High | Dry-run on staging with production clone |
| Multi-branch network partition | Medium | Chaos testing in staging |
| Payment webhook reliability | Medium | Idempotency + reconciliation job |
