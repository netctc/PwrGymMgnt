# 18 — API Design

## Overview

All new endpoints use the `/api/v2/` prefix to coexist with the current `/api/` routes during the strangler migration. Authentication uses the existing JWT cookie mechanism.

## Common Conventions

| Convention | Value |
|-----------|-------|
| Base path | `/api/v2/` |
| Auth | JWT cookie (`gym_session`) |
| Content-Type | `application/json` |
| Pagination | `?page=1&per_page=20` |
| Sorting | `?sort=created_at&order=desc` |
| Filtering | `?status=active&branch_id=xxx` |
| Idempotency | `Idempotency-Key` header (POST/PATCH) |
| Rate limit | 300 req/15min (standard), 50 req/15min (sensitive) |

## Error Response Format

```json
{
  "error": {
    "code": "INSUFFICIENT_SESSIONS",
    "message": "No sessions remaining in current cycle",
    "details": { "balance": 0, "cycle_end": "2025-08-31" },
    "request_id": "req-uuid"
  }
}
```

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate or constraint violation |
| `UNPROCESSABLE` | 422 | Business rule violation |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Database unavailable |

---

## Plans API

### GET /api/v2/plans

List active plans (public catalog).

| Param | Type | Description |
|-------|------|-------------|
| `type` | query | Filter by plan type |
| `branch_id` | query | Filter by branch availability |

**Response 200:**
```json
{
  "data": [
    {
      "id": "plan-uuid",
      "code": "IND_GOLD_MONTHLY_V3",
      "name": "Gold Monthly",
      "type": "individual",
      "version": 3,
      "benefits": { "sessions_per_cycle": 20 },
      "pricing": { "cycle_price": 199.90 }
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 5 }
}
```

**Permissions:** Public (no auth required)

### POST /api/v2/plans

Create a new plan (draft).

**Permissions:** `admin+`

**Body:**
```json
{
  "code": "IND_PREMIUM_MONTHLY",
  "name": "Premium Monthly",
  "type": "individual",
  "benefits": {},
  "restrictions": {},
  "pricing": {}
}
```

**Response 201:** Created plan object

### POST /api/v2/plans/:id/publish

**Permissions:** `admin+`  
**Response 200:** Updated plan with `status: active`  
**Errors:** 422 if missing benefits or pricing

---

## Subscriptions API

### POST /api/v2/subscriptions

Create a subscription.

**Permissions:** `admin+` or self (holder)

**Body:**
```json
{
  "plan_id": "plan-uuid",
  "holder_person_id": "person-uuid",
  "billing_cycle": "monthly",
  "beneficiaries": [
    { "person_id": "person-uuid-2", "role": "beneficiary" }
  ]
}
```

**Response 201:**
```json
{
  "id": "sub-uuid",
  "status": "pending",
  "plan": { "id": "plan-uuid", "name": "Family Pack 4" },
  "members": [...],
  "payment_url": "https://pay.example.com/intent/..."
}
```

**Errors:** 409 (BR-01, BR-02, BR-06), 422 (BR-04, BR-05)

### POST /api/v2/subscriptions/:id/members

Add member to subscription.

**Permissions:** `holder` or `admin` of subscription

**Body:**
```json
{
  "person_id": "person-uuid",
  "role": "beneficiary"
}
```

**Errors:** 409 (duplicate), 422 (max reached)

### POST /api/v2/subscriptions/:id/suspend

**Permissions:** `admin+`  
**Body:** `{ "reason": "payment_failed" }`

### POST /api/v2/subscriptions/:id/cancel

**Permissions:** `holder` or `admin+`  
**Body:** `{ "reason": "member_request", "effective": "immediate" }`

---

## Affiliations API

### GET /api/v2/persons/:pid/affiliations

**Permissions:** `self` or `admin+`

**Response 200:**
```json
{
  "data": [
    {
      "id": "aff-uuid",
      "subscription_id": "sub-uuid",
      "plan_name": "Gold Monthly",
      "status": "active",
      "priority": 1,
      "balance": 15,
      "cycle_end": "2025-08-31"
    }
  ]
}
```

### POST /api/v2/affiliations/:id/freeze

**Permissions:** `self` or `admin+`  
**Body:** `{ "days": 15, "reason": "travel" }`  
**Errors:** 422 (BR-19 cooldown, BR-20 max days)

---

## Access API

### POST /api/v2/access/authorize

Main access decision endpoint.

**Permissions:** `system` (device service account)

**Body:** See AccessRequest in [11-ACCESS-AUTHORIZATION.md](./11-ACCESS-AUTHORIZATION.md)

**Response 200:**
```json
{
  "request_id": "req-uuid",
  "decision": "granted",
  "person_id": "person-uuid",
  "affiliation_id": "aff-uuid",
  "device_command": {
    "action": "open",
    "device_id": "dev-001",
    "timeout_ms": 5000,
    "display_message": "Welcome, Maria! (14 sessions left)"
  },
  "session_info": {
    "sessions_remaining": 14,
    "cycle_end_date": "2025-08-31",
    "plan_name": "Gold Monthly"
  }
}
```

### GET /api/v2/access/presence

**Permissions:** `staff+`  
**Description:** Members currently inside (entry without exit)

---

## Session Ledger API

### GET /api/v2/affiliations/:id/balance

**Permissions:** `self` or `admin+`

**Response 200:**
```json
{
  "affiliation_id": "aff-uuid",
  "cycle_id": "cycle-uuid",
  "balance": 15,
  "allocated": 20,
  "consumed": 4,
  "adjustments": 1,
  "carried_over": 2,
  "cycle_start": "2025-08-01",
  "cycle_end": "2025-08-31"
}
```

### GET /api/v2/affiliations/:id/ledger

**Permissions:** `self` or `admin+`  
**Query params:** `?cycle_id=xxx&page=1&per_page=50`

---

## Biometric API

### POST /api/v2/biometric/enroll

**Permissions:** `staff+`

**Body:**
```json
{
  "person_id": "person-uuid",
  "consent_given": true,
  "consent_document_ref": "consent-2025-001"
}
```

**Response 201:**
```json
{
  "session_id": "enroll-session-uuid",
  "status": "awaiting_capture",
  "instructions": "Position face in frame, follow prompts"
}
```

### DELETE /api/v2/biometric/persons/:id/delete

**Permissions:** `self` or `admin+`  
**Response 200:** `{ "deleted": true, "purge_deadline": "2025-08-18T..." }`

---

## Devices API

### GET /api/v2/devices

**Permissions:** `admin+`

### POST /api/v2/devices/:id/command

**Permissions:** `admin+`

**Body:**
```json
{
  "action": "open",
  "reason": "manual_test",
  "timeout_ms": 5000
}
```

---

## Cycles API

### GET /api/v2/subscriptions/:id/cycles

**Permissions:** `member_of` or `admin+`

### GET /api/v2/cycles/:id/summary

**Permissions:** `member_of` or `admin+`

**Response 200:**
```json
{
  "cycle_id": "cycle-uuid",
  "sequence": 3,
  "status": "active",
  "start_date": "2025-08-01",
  "end_date": "2025-08-31",
  "total_allocated": 20,
  "total_consumed": 12,
  "total_remaining": 8,
  "carryover_received": 3,
  "carryover_expiry": "2025-08-31"
}
```
