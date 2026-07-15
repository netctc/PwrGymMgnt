# 17 — Key Flows (Sequence Diagrams)

## Overview

This document provides Mermaid sequence diagrams for the most critical user and system flows in the evolved PowerGym system.

## 1. Member Access via Facial Recognition

```mermaid
sequenceDiagram
    participant M as Member
    participant ED as Edge Device
    participant GW as Device Gateway
    participant AM as Access Motor
    participant DB as MySQL
    participant LED as Ledger Service
    participant DEV as Turnstile

    M->>ED: Approach (face detected)
    ED->>ED: Liveness check (blink)
    ED->>ED: Extract embedding
    ED->>ED: 1:N match (local cache)
    ED->>GW: Match result {person_id, confidence: 0.92}
    GW->>AM: AccessRequest {method: facial}
    AM->>DB: SELECT person, affiliations WHERE person_id
    DB-->>AM: Person + 2 active affiliations
    AM->>AM: Priority resolution → affiliation A
    AM->>DB: SELECT balance WHERE affiliation_id + cycle_id FOR UPDATE
    DB-->>AM: balance = 15
    AM->>AM: Validate: time slot ✓, branch ✓, balance > 0 ✓
    AM->>LED: Debit 1 session (idempotency key)
    LED->>DB: INSERT ledger entry
    AM->>GW: AccessResponse {granted, open command}
    GW->>DEV: OpenCommand {timeout: 5000ms}
    DEV-->>GW: Ack
    DEV->>DEV: Unlock turnstile
    M->>DEV: Pass through
    DEV->>GW: passage_confirmed
    GW->>AM: PassageConfirmed
    AM->>DB: UPDATE access_attempt SET completed
```

## 2. Member Access via QR Code

```mermaid
sequenceDiagram
    participant M as Member
    participant APP as Mobile App
    participant SC as QR Scanner
    participant AM as Access Motor
    participant DB as MySQL
    participant DEV as Turnstile

    M->>APP: Open e-card
    APP->>APP: Generate encrypted QR {person_id, timestamp, signature}
    M->>SC: Present QR to scanner
    SC->>SC: Decode & verify signature
    SC->>AM: AccessRequest {method: qr, person_id}
    AM->>AM: Validate QR timestamp (< 5 min old)
    AM->>DB: Resolve person + affiliations
    AM->>AM: Run validation pipeline
    AM->>DB: Debit session
    AM->>SC: AccessResponse {granted}
    SC->>DEV: OpenCommand
    DEV-->>M: Turnstile opens
```

## 3. Family Plan Subscription Creation

```mermaid
sequenceDiagram
    participant H as Holder
    participant UI as Admin UI
    participant API as Subscription API
    participant DB as MySQL
    participant PAY as Payment Service
    participant N as Notifications

    H->>UI: Select "Family Pack 4" plan
    UI->>API: POST /subscriptions {plan_id, holder_person_id, beneficiaries[]}
    API->>DB: Validate plan active, holder limits
    API->>DB: Validate beneficiary limits (BR-01, BR-02, BR-05)
    API->>DB: INSERT subscription (status: pending)
    API->>DB: INSERT subscription_members (holder + beneficiaries)
    API->>DB: INSERT affiliations (status: pending) for each member
    API->>PAY: Create payment intent
    PAY-->>API: payment_intent_id
    API-->>UI: {subscription_id, payment_url}
    UI-->>H: Redirect to payment

    H->>PAY: Complete payment
    PAY->>API: Webhook: payment_confirmed
    API->>DB: UPDATE subscription SET status = active
    API->>DB: UPDATE affiliations SET status = active
    API->>DB: INSERT cycle (sequence: 1, status: active)
    API->>DB: INSERT session_ledger (CYCLE_CREDIT × 4 affiliations)
    API->>N: Send welcome emails to all members
```

## 4. Cycle Renewal with Carryover

```mermaid
sequenceDiagram
    participant CRON as Scheduler
    participant CS as Cycle Service
    participant DB as MySQL
    participant LED as Ledger Service
    participant N as Notifications

    CRON->>CS: Process cycles ending today
    CS->>DB: SELECT cycles WHERE end_date = TODAY AND status = active
    DB-->>CS: [cycle-123]
    CS->>DB: SELECT balance for cycle-123
    DB-->>CS: balance = 7, allocated = 20
    CS->>CS: Calculate carryover: MIN(7, 10, 50% of 20) = 7
    CS->>LED: INSERT expiration entry (qty: 0, all carry over)
    CS->>DB: UPDATE cycle-123 SET status = closed
    CS->>DB: INSERT cycle-124 (sequence: 2, status: active)
    CS->>LED: INSERT CYCLE_CREDIT (qty: 20)
    CS->>LED: INSERT CARRYOVER_CREDIT (qty: 7, expires: +30 days)
    CS->>N: Notify member: "New cycle started, 7 sessions carried over"
```

## 5. Affiliation Freeze

```mermaid
sequenceDiagram
    participant M as Member
    participant API as Affiliation API
    participant DB as MySQL
    participant SM as State Machine

    M->>API: POST /affiliations/:id/freeze {days: 15}
    API->>DB: SELECT affiliation FOR UPDATE
    DB-->>API: {status: active, freeze_days_used: 10, max: 30}
    API->>API: Validate: BR-19 (cooldown 60 days since last unfreeze) ✓
    API->>API: Validate: BR-20 (10 + 15 = 25 ≤ 30) ✓
    API->>SM: Transition: active → frozen
    SM->>DB: UPDATE affiliation SET status = frozen
    SM->>DB: INSERT state_transition log
    SM->>DB: INSERT affiliation_status_log
    API->>DB: SET freeze_until = NOW() + 15 days
    API-->>M: {status: frozen, until: "2025-08-30"}
```

## 6. Manual Override Access

```mermaid
sequenceDiagram
    participant R as Receptionist
    participant UI as Admin Panel
    participant AM as Access Motor
    participant DB as MySQL
    participant DEV as Turnstile

    R->>UI: Search member "João Silva"
    UI->>DB: Find person by name
    DB-->>UI: person_id: p-456
    R->>UI: Click "Grant Manual Access"
    UI->>UI: Prompt for reason
    R->>UI: Enter: "QR app not working, verified ID"
    UI->>AM: AccessRequest {method: manual, operator_id, person_id, reason}
    AM->>AM: Verify operator has access_override permission
    AM->>DB: Log access_attempt (method: manual)
    Note over AM: Manual override skips: time_slot, session_balance, duplicate_entry
    AM->>DB: Debit session (if balance > 0) or mark as override-no-debit
    AM->>DEV: OpenCommand
    DEV-->>R: Turnstile opened
    R-->>UI: "Access granted (manual)"
```

## 7. Biometric Enrollment

```mermaid
sequenceDiagram
    participant S as Staff
    participant K as Kiosk
    participant M as Member
    participant API as Biometric API
    participant BIO as Biometric Engine
    participant STORE as Template Store
    participant SYNC as Sync Service
    participant ED as Edge Devices

    S->>K: Initiate enrollment for member p-789
    K->>API: POST /biometric/enroll {person_id, consent: true}
    API->>API: Verify consent flag (BR-26)
    API-->>K: {session_id, instructions}
    K-->>M: "Look at camera, follow instructions"
    M->>K: Face captured (front)
    M->>K: Face captured (left 15°)
    M->>K: Face captured (right 15°)
    K->>K: Liveness challenge: blink
    M->>K: Blink detected
    K->>API: POST /biometric/enroll/:session/complete {images: 3}
    API->>BIO: Extract embeddings
    BIO->>BIO: Quality check (all ≥ 0.7)
    BIO-->>API: {template_id, quality_scores}
    API->>STORE: Store encrypted template
    API->>SYNC: Push to branch devices
    SYNC->>ED: Sync new template
    ED-->>SYNC: Ack
    SYNC-->>API: Sync complete
    API-->>K: "Enrollment successful"
    K-->>M: "Face registered! You can now use facial access"
```

## 8. Shared Pool Session Debit

```mermaid
sequenceDiagram
    participant AM as Access Motor
    participant DB as MySQL
    participant LED as Ledger

    AM->>DB: SELECT subscription WHERE affiliation.subscription_id FOR UPDATE
    Note over AM,DB: Lock at subscription level for shared pool
    AM->>DB: SELECT SUM(balance) FROM session_ledger WHERE subscription pool
    DB-->>AM: pool_balance = 8
    AM->>AM: Validate pool_balance > 0
    AM->>LED: INSERT debit (affiliation_id, reason: ACCESS_ENTRY)
    LED->>DB: INSERT session_ledger entry
    AM->>DB: UPDATE balance_cache for subscription pool
    AM->>DB: COMMIT
```

## 9. Passage Timeout Compensation

```mermaid
sequenceDiagram
    participant DEV as Turnstile
    participant GW as Gateway
    participant AM as Access Motor
    participant LED as Ledger
    participant DB as MySQL

    DEV->>GW: passage_timeout {command_id}
    GW->>AM: PassageTimeout event
    AM->>DB: SELECT access_attempt WHERE command_id
    DB-->>AM: {session_debited: true, affiliation_id}
    AM->>AM: Wait 5s (compensation delay)
    AM->>GW: Check for late passage confirmation
    GW-->>AM: No passage detected
    AM->>LED: INSERT adjustment (direction: in, reason: PASSAGE_TIMEOUT)
    LED->>DB: INSERT session_ledger (+1)
    AM->>DB: UPDATE access_attempt SET compensated = true
    AM->>DB: INSERT outbox_event (type: compensation.applied)
```

## 10. Subscription Suspension on Payment Failure

```mermaid
sequenceDiagram
    participant PAY as Payment System
    participant API as Subscription Service
    participant DB as MySQL
    participant SM as State Machine
    participant N as Notifications

    PAY->>API: Webhook: payment_failed {subscription_id}
    API->>DB: SELECT subscription, current_cycle
    API->>DB: UPDATE cycle SET status = grace
    API->>N: Notify holder: "Payment failed, 7-day grace"
    
    Note over API: 7 days later...
    
    API->>DB: SELECT cycles WHERE status = grace AND grace_end < NOW()
    API->>SM: Transition subscription: active → suspended
    SM->>DB: UPDATE subscription SET status = suspended
    SM->>DB: UPDATE affiliations SET status = suspended (all members)
    SM->>DB: INSERT state_transitions (bulk)
    API->>N: Notify all members: "Access suspended"
    API->>DB: INSERT outbox_event (subscription.suspended)
```
