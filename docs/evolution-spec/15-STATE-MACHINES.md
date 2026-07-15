# 15 — State Machines

## Overview

This document defines the formal state machines for all major entities in the PowerGym evolution. Each state machine specifies valid states, transitions, guards (conditions), and side effects.

## 1. Plan State Machine

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> active : publish [has_benefits AND has_pricing]
    active --> sunset : deprecate [no_new_subs_allowed]
    sunset --> archived : archive [sunset_window_elapsed AND no_active_subs]
    active --> draft : unpublish [zero_subscribers]
    sunset --> active : reactivate [within_sunset_window]
    archived --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `publish` | Benefits configured, pricing set | Emit `plan.published`, visible to members |
| `deprecate` | At least one active version exists | Emit `plan.sunset`, notify current subs |
| `archive` | 30+ days in sunset, no active subscriptions | Emit `plan.archived`, remove from catalog |
| `unpublish` | No subscribers on this version | Return to editable state |
| `reactivate` | Within sunset window (30 days) | Emit `plan.reactivated`, re-list in catalog |

## 2. Subscription State Machine

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> active : payment_confirmed
    pending --> cancelled : holder_cancelled
    pending --> cancelled : creation_timeout [72h]
    active --> suspended : payment_failed [after_grace]
    active --> suspended : admin_suspension
    active --> cancelled : holder_request
    active --> expired : end_date_reached [no_renewal]
    suspended --> active : payment_resolved
    suspended --> cancelled : grace_exceeded [14_days]
    expired --> active : renewed [within_30_days]
    cancelled --> [*]
    expired --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `payment_confirmed` | Valid payment reference | Create first cycle, activate affiliations |
| `holder_cancelled` | Holder identity verified | Expire sessions, notify beneficiaries |
| `payment_failed` | Grace period (7 days) elapsed | Suspend all affiliations, notify holder |
| `admin_suspension` | Admin has permission | Suspend all affiliations, log reason |
| `payment_resolved` | Payment received | Reactivate affiliations, resume cycle |
| `renewed` | Within 30-day renewal window | Create new cycle, credit sessions |

## 3. Affiliation State Machine

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> active : subscription_activated
    active --> frozen : freeze_request [freeze_days_available]
    active --> suspended : subscription_suspended
    active --> suspended : admin_block
    active --> expired : subscription_expired
    active --> cancelled : removed_from_subscription
    frozen --> active : unfreeze_request
    frozen --> active : max_freeze_reached
    frozen --> cancelled : subscription_cancelled
    suspended --> active : subscription_reactivated
    suspended --> cancelled : grace_exceeded
    expired --> active : subscription_renewed
    cancelled --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `freeze_request` | Freeze days remaining > 0, cooldown elapsed | Pause session consumption, pause billing |
| `unfreeze_request` | Currently frozen | Resume access, recalculate remaining days |
| `removed_from_subscription` | Not the holder | Forfeit remaining sessions |

## 4. Cycle State Machine

```mermaid
stateDiagram-v2
    [*] --> upcoming
    upcoming --> active : start_date_reached
    active --> grace : end_date_reached [grace_configured]
    active --> closed : end_date_reached [no_grace]
    grace --> closed : payment_received
    grace --> expired : grace_end_reached
    closed --> [*]
    expired --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `start_date_reached` | Automatic (scheduler) | Credit sessions to ledger |
| `end_date_reached` | Automatic (scheduler) | Process carryover/expiration |
| `payment_received` | Payment confirmed during grace | Normal close, create next cycle |
| `grace_end_reached` | No payment after grace days | Expire sessions, suspend subscription |

## 5. Booking State Machine

```mermaid
stateDiagram-v2
    [*] --> reserved
    reserved --> confirmed : check_in [within_window]
    reserved --> cancelled : member_cancel [before_deadline]
    reserved --> no_show : class_started [no_check_in]
    confirmed --> completed : class_ended
    confirmed --> cancelled : admin_cancel
    cancelled --> [*]
    no_show --> [*]
    completed --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `reserved` | Sessions available, within booking limit | Debit session (hold) |
| `member_cancel` | > 4h before class start | Refund session |
| `no_show` | 15 min after class start, not checked in | Apply no-show penalty |
| `confirmed` | Member present at class | No additional debit |
| `admin_cancel` | Admin permission | Refund session |

## 6. Biometric Profile State Machine

```mermaid
stateDiagram-v2
    [*] --> not_enrolled
    not_enrolled --> enrolling : start_enrollment [consent_given]
    enrolling --> enrolled : templates_extracted [quality >= 0.7]
    enrolling --> failed : quality_check_failed
    failed --> enrolling : retry [attempts < 3]
    failed --> not_enrolled : max_retries_exceeded
    enrolled --> active : synced_to_devices
    active --> suspended : security_alert
    active --> suspended : admin_action
    active --> re_enrolling : update_required
    re_enrolling --> active : new_template_synced
    suspended --> active : reactivated [issue_resolved]
    active --> deleted : consent_withdrawn
    active --> deleted : member_left
    deleted --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `start_enrollment` | Written consent on file | Initialize enrollment session |
| `templates_extracted` | 3 quality images, quality ≥ 0.7 | Store encrypted template |
| `synced_to_devices` | All branch devices acknowledge | Enable facial access |
| `security_alert` | Suspicious activity detected | Disable facial, notify security |
| `consent_withdrawn` | Member request | Delete all templates, purge cache |

## 7. Access Attempt State Machine

```mermaid
stateDiagram-v2
    [*] --> initiated
    initiated --> identified : person_resolved
    initiated --> denied : identification_failed
    identified --> authorized : all_checks_passed
    identified --> denied : check_failed
    authorized --> command_sent : device_command_dispatched
    command_sent --> passage_confirmed : sensor_triggered
    command_sent --> passage_timeout : timeout_elapsed
    passage_confirmed --> completed : logged
    passage_timeout --> compensated : session_refunded
    denied --> completed : logged
    compensated --> completed : logged
    completed --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `person_resolved` | Valid identification (QR/face/manual) | Load person affiliations |
| `all_checks_passed` | Pipeline validation passed | Debit session from ledger |
| `device_command_dispatched` | Device online, ack received | Start passage timer |
| `passage_confirmed` | Sensor detects passage | Mark attempt successful |
| `passage_timeout` | No sensor event within timeout_ms | Trigger compensation |
| `session_refunded` | Timeout confirmed | Credit session back |

## 8. Opening Command State Machine

```mermaid
stateDiagram-v2
    [*] --> created
    created --> sent : dispatched_to_gateway
    sent --> acknowledged : device_ack_received
    sent --> failed : ack_timeout [3s]
    acknowledged --> executed : device_confirms_unlock
    acknowledged --> failed : execution_error
    executed --> passage_detected : sensor_triggered
    executed --> timed_out : passage_window_expired
    failed --> retrying : retry_count < 3
    retrying --> sent : re_dispatched
    failed --> abandoned : max_retries
    passage_detected --> [*]
    timed_out --> [*]
    abandoned --> [*]
```

| Transition | Guard | Side Effect |
|-----------|-------|-------------|
| `dispatched_to_gateway` | Device marked online | Start ack timer (3s) |
| `device_ack_received` | Valid ack from device | Clear ack timer |
| `device_confirms_unlock` | Mechanism unlocked | Start passage timer |
| `passage_window_expired` | No passage within timeout_ms | Re-lock device, start compensation |
| `max_retries` | 3 failed attempts | Alert staff, offer alternative device |

## State Persistence

All state machines persist their current state and transition history:

```sql
CREATE TABLE state_transitions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('plan','subscription','affiliation','cycle','booking','biometric_profile','access_attempt','opening_command'),
    entity_id VARCHAR(36) NOT NULL,
    from_state VARCHAR(30),
    to_state VARCHAR(30) NOT NULL,
    event VARCHAR(50) NOT NULL,
    actor_id VARCHAR(36),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id, created_at)
) ENGINE=InnoDB;
```
