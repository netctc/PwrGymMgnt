# 23 — Edge Cases

## Overview

This document catalogs edge cases across the three most complex domains: sessions/ledger, affiliations, and facial recognition. Each case defines the scenario, expected behavior, and resolution strategy.

## Session & Ledger Edge Cases

### EC-S01: Race Condition on Last Session

**Scenario:** Two devices simultaneously request access for the same person with balance = 1.

| Step | Device A | Device B |
|------|----------|----------|
| 1 | SELECT balance FOR UPDATE (balance = 1) | Blocked (waiting for lock) |
| 2 | INSERT debit, COMMIT | Acquires lock |
| 3 | Access granted | SELECT balance (balance = 0) |
| 4 | — | Access denied: insufficient_sessions |

**Resolution:** SELECT FOR UPDATE at affiliation level prevents double-debit.

### EC-S02: Shared Pool Simultaneous Access

**Scenario:** Family plan with 1 session remaining. Father at Branch A, son at Branch B, both tap QR within milliseconds.

**Expected behavior:** One gets access, one is denied. Lock at subscription level ensures atomicity.

**Resolution:** Subscription-level lock serializes pool access regardless of branch.

### EC-S03: Session Debit During Cycle Transition

**Scenario:** Member taps at 23:59:59, cycle ends at 00:00:00. Debit in progress when cycle close job runs.

**Expected behavior:** 
- If debit commits first → deducted from current cycle (valid)
- Cycle close job sees reduced balance → carries over less

**Resolution:** Cycle close job uses `SELECT FOR UPDATE` on cycle row. If mid-debit, it waits.

### EC-S04: Compensation After Exit Already Recorded

**Scenario:** Passage timeout triggers compensation (+1 session). But 2 seconds later, the delayed sensor triggers passage_confirmed.

**Expected behavior:** Compensation should be reversed since passage actually occurred.

**Resolution:** 
1. Compensation has a 5-second delay window
2. If passage_confirmed arrives during delay → no compensation
3. If compensation already applied and late passage arrives → write reversal entry (ADMIN_ADJUSTMENT, -1)
4. Net effect: correct balance

### EC-S05: Negative Balance After Admin Adjustment

**Scenario:** Admin removes 5 sessions as penalty, but member only has 3 remaining.

**Expected behavior:** Allow adjustment (balance goes to -2). Access is denied until next cycle credit.

**Resolution:** Admin adjustments can create negative balance (BR-09 applies only to access debits, not admin corrections).

### EC-S06: Carryover Calculation With Mid-Cycle Freeze

**Scenario:** Member freezes for 15 days mid-cycle. Cycle has 20 sessions, member used 8 before freeze.

**Expected behavior:**
- On unfreeze: remaining sessions = 12 (preserved during freeze)
- At cycle end: unused = 12 - (sessions used after unfreeze)
- Carryover calculated on final unused amount

### EC-S07: Idempotency Key Replay After Timeout

**Scenario:** Client sends debit request, server processes it but response times out. Client retries with same idempotency key.

**Expected behavior:** Second request returns the cached response from the first execution. No double-debit.

---

## Affiliation Edge Cases

### EC-A01: Person With All Affiliations Frozen

**Scenario:** Person has 3 affiliations, all currently frozen. They present at the turnstile.

**Expected behavior:** Access denied with `no_active_affiliation`. Message: "All your plans are currently frozen."

### EC-A02: Subscription Cancelled While Person Has Other Active Affiliations

**Scenario:** Person is beneficiary in Sub-A (cancelled) and holder of Sub-B (active).

**Expected behavior:**
- Affiliation from Sub-A → `cancelled`
- Affiliation from Sub-B → unaffected, remains `active`
- Person can still access via Sub-B

### EC-A03: Holder Removed From Their Own Subscription

**Scenario:** Attempt to remove the holder from a subscription via API.

**Expected behavior:** Reject with 422. Holder can only be removed by cancelling the entire subscription.

### EC-A04: Priority Tie Between Affiliations

**Scenario:** Person has 2 active affiliations, both with `priority = 0`, same sessions remaining.

**Expected behavior:** Use secondary sort: most recently activated wins. Deterministic ordering prevents flickering.

### EC-A05: Affiliation Activated After Person Already Inside

**Scenario:** Person enters via Affiliation A. While inside, Affiliation B is activated (new subscription starts).

**Expected behavior:** No immediate effect. Next entry uses priority resolution between A and B. The "inside" status is per-person, not per-affiliation.

### EC-A06: Freeze Request at Max Freeze Limit

**Scenario:** Affiliation has used 28 of 30 allowed freeze days. Member requests 5 more days.

**Expected behavior:** Reject with 422, respond: "Only 2 freeze days remaining. Maximum freeze duration: 2 days."

### EC-A07: Corporate Subscription Bulk Removal

**Scenario:** Company removes 50 employees from corporate plan simultaneously.

**Expected behavior:**
- All 50 affiliations → `cancelled`
- Each gets state transition log entry
- Session balances forfeited
- Processed in batches (10 per transaction) to avoid long-running locks

### EC-A08: Person Blocked Globally While Mid-Access

**Scenario:** Admin globally blocks a person while the person is mid-passage (device already opened).

**Expected behavior:** Current passage completes (can't recall a physical action). Block takes effect on next attempt. Access attempt log shows last granted access.

---

## Facial Recognition Edge Cases

### EC-F01: Identical Twins

**Scenario:** Two twins enrolled. Twin A approaches, system matches both with high confidence.

**Expected behavior:**
- If top match confidence gap > 0.05, use top match
- If gap < 0.05 (effectively identical), require secondary verification (QR)
- Log as "multi-match ambiguity" event

### EC-F02: Member Significantly Changes Appearance

**Scenario:** Member grows a beard, loses weight, or wears glasses not present during enrollment.

**Expected behavior:**
- Confidence may drop below 0.85
- Falls into "require QR verification" zone (0.70–0.84)
- After 3 QR-verified accesses with low facial confidence → suggest re-enrollment

**Resolution:** System tracks rolling average confidence. If avg drops below 0.80 over 5 attempts, push notification: "Update your facial profile for faster access."

### EC-F03: Camera Obstructed or Dirty

**Scenario:** Camera lens is partially obstructed, all members getting low confidence scores.

**Expected behavior:**
- If >5 consecutive denials/low-confidence in 10 minutes → alert maintenance
- Auto-switch branch to QR-only mode
- Log device event: `camera_quality_degraded`

### EC-F04: Edge Device Loses Network Connectivity

**Scenario:** Edge device cannot reach backend for 5 minutes.

**Expected behavior:**
- Continue matching against local cache (embeddings stored on device)
- Queue access decisions locally
- When connection restores, sync queued events to backend
- Maximum offline operation: 24 hours before forced QR-only mode

### EC-F05: Liveness Attack with High-Quality Mask

**Scenario:** Attacker uses silicone mask that passes basic 3D depth check.

**Expected behavior:**
- Multi-layered detection: depth + skin texture + thermal (if available)
- If single-factor liveness only → may false-accept
- Mitigation: random active challenges (blink + head turn) make masks impractical
- Flag: if same person accesses >6 times/day, escalate to security review

### EC-F06: Template Sync Failure for New Enrollment

**Scenario:** Member enrolls at Branch A but sync to Branch B fails.

**Expected behavior:**
- Member can use facial at Branch A immediately (local enrollment)
- Branch B falls back to QR until sync succeeds
- Retry sync every 30 seconds, alert after 5 failures
- Member gets push notification: "Facial access at [Branch B] will be available shortly"

### EC-F07: Consent Withdrawn Mid-Access

**Scenario:** Member withdraws biometric consent via app while standing at turnstile with face being scanned.

**Expected behavior:**
- Current scan completes (already in progress)
- Backend receives withdrawal flag
- Next access attempt: facial method disabled for this person
- Edge cache purge scheduled within 72 hours (BR-28)
- Member must use QR or manual from next attempt

### EC-F08: Power Failure at Edge Device

**Scenario:** Edge device loses power during face matching, command already dispatched.

**Expected behavior:**
- If command was sent and acked by turnstile → passage timer handles it
- If command not yet sent → no action taken, member retries
- On device reboot: re-sync cache, clear any pending states
- No phantom access possible (turnstile only opens on explicit command)

### EC-F09: Enrollment Photo Quality Degradation Over Time

**Scenario:** Member enrolled 2 years ago. Template accuracy decreases as face ages.

**Expected behavior:**
- Track confidence trend per member over time
- If average confidence drops below 0.80 consistently → suggest re-enrollment
- Annual re-enrollment recommendation (optional, not mandatory)
- System-wide periodic quality audit job

### EC-F10: Multiple Faces Detected Simultaneously

**Scenario:** Two people approach the camera at the same time.

**Expected behavior:**
- Edge device detects multiple faces
- Select largest face (closest to camera) for primary recognition
- Second face ignored until first person clears
- If both faces match enrolled members → process sequentially
- Anti-tailgating logic applies after first passage
