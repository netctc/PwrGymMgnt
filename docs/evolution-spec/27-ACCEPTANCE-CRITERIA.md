# 27 — Acceptance Criteria (Gherkin)

## Overview

Acceptance criteria in Gherkin format for the core capabilities of the evolved PowerGym system.

---

## Feature: Plan Management

```gherkin
Feature: Plan Configuration and Versioning

  Scenario: Create a new plan in draft status
    Given I am logged in as "admin"
    When I create a plan with name "Gold Monthly" and type "individual"
    Then the plan status should be "draft"
    And the plan version should be 1
    And the plan should not be visible in the public catalog

  Scenario: Publish a plan with complete configuration
    Given a draft plan "Gold Monthly" exists with benefits and pricing configured
    When I publish the plan
    Then the plan status should be "active"
    And the plan should be visible in the public catalog

  Scenario: Prevent publishing incomplete plan
    Given a draft plan "Incomplete Plan" exists without pricing
    When I attempt to publish the plan
    Then I should receive a 422 error with message "Pricing must be configured before publishing"

  Scenario: Create new plan version
    Given an active plan "Gold Monthly" version 1 with 3 subscribers
    When I create a new version
    Then a new draft version 2 should be created
    And version 1 should remain active
    And existing subscribers should stay on version 1

  Scenario: Sunset a plan
    Given an active plan "Silver Basic" with active subscribers
    When I deprecate the plan
    Then the plan status should be "sunset"
    And no new subscriptions should be allowed
    And existing subscribers should continue normally
```

---

## Feature: Multi-User Subscriptions

```gherkin
Feature: Subscription Lifecycle

  Scenario: Create a family subscription
    Given an active plan "Family Pack 4" with max_beneficiaries = 4
    And a person "Maria Silva" exists
    When Maria creates a subscription as holder with 2 beneficiaries
    Then the subscription should have status "pending"
    And the subscription should have 3 members (1 holder + 2 beneficiaries)

  Scenario: Activate subscription on payment
    Given a pending subscription for "Maria Silva"
    When payment is confirmed
    Then the subscription status should be "active"
    And all affiliations should be "active"
    And a cycle should be created with status "active"
    And session credits should be allocated

  Scenario: Prevent exceeding beneficiary limit
    Given an active subscription on "Family Pack 4" with 4 members
    When the holder attempts to add a 5th beneficiary
    Then the request should be rejected with 422
    And the error message should mention "maximum beneficiaries reached"

  Scenario: Prevent duplicate membership
    Given person "João" is already a beneficiary in subscription "SUB-001"
    When someone attempts to add "João" to "SUB-001" again
    Then the request should be rejected with 409

  Scenario: Suspend on payment failure after grace period
    Given an active subscription with payment due
    When payment fails and 7 days grace period elapses
    Then the subscription should be "suspended"
    And all member affiliations should be "suspended"
    And all members should be denied access
```

---

## Feature: Access Authorization

```gherkin
Feature: Unified Access Control

  Scenario: Successful access via QR code
    Given member "Carlos" has an active affiliation with balance = 10
    And Carlos presents a valid QR code at turnstile "T-01"
    When the access request is processed
    Then the decision should be "granted"
    And a session should be debited (balance = 9)
    And the turnstile should receive an open command

  Scenario: Successful access via facial recognition
    Given member "Ana" has an enrolled biometric profile
    And Ana approaches turnstile "T-02" with confidence 0.91
    And liveness check passes
    When the access request is processed
    Then the decision should be "granted"
    And the turnstile should open

  Scenario: Deny access with insufficient sessions
    Given member "Pedro" has an active affiliation with balance = 0
    When Pedro presents QR at turnstile "T-01"
    Then the decision should be "denied"
    And the denial reason should be "insufficient_sessions"
    And no session should be debited
    And the turnstile should remain locked

  Scenario: Deny access outside time slot
    Given member "Lucia" has a plan allowing only "morning" (06:00-12:00)
    And the current time is 14:30
    When Lucia presents QR at the turnstile
    Then the decision should be "denied"
    And the denial reason should be "outside_time_slot"

  Scenario: Facial recognition below threshold
    Given member "Roberto" has an enrolled biometric profile
    And Roberto approaches with confidence 0.75
    When the access request is processed
    Then the decision should be "denied"
    And the denial reason should be "facial_confidence_low"
    And the display should show "Please use QR code to verify"

  Scenario: Access with multiple affiliations and pre-selection
    Given member "Sofia" has 2 active affiliations (personal and corporate)
    And Sofia pre-selected her corporate affiliation
    When Sofia presents QR at the turnstile
    Then the session should be debited from the corporate affiliation
    And not from the personal affiliation

  Scenario: Duplicate entry prevention
    Given member "Diego" entered the gym at 09:00 without exit recorded
    When Diego presents QR at 09:30
    Then the decision should be "denied"
    And the denial reason should be "duplicate_entry"
```

---

## Feature: Session Ledger

```gherkin
Feature: Immutable Session Tracking

  Scenario: Credit sessions on cycle start
    Given an active affiliation with a new cycle starting
    And the plan allocates 20 sessions per cycle
    When the cycle starts
    Then 20 sessions should be credited to the ledger
    And the balance should be 20

  Scenario: Debit on access is idempotent
    Given an access request with idempotency key "abc-123"
    When the debit request is processed twice with the same key
    Then only one ledger entry should exist
    And the balance should decrease by 1 (not 2)

  Scenario: Compensation on passage timeout
    Given member "Ana" was granted access and debited 1 session
    When the turnstile times out without passage detection
    Then 1 session should be credited back with reason "PASSAGE_TIMEOUT"
    And the net balance change should be 0

  Scenario: Shared pool debit
    Given a family subscription with shared pool of 40 sessions
    And beneficiary "Child A" accesses the gym
    When the session is debited
    Then the pool balance should decrease by 1
    And both beneficiary "Child A" and "Child B" see updated pool balance
```

---

## Feature: Affiliations

```gherkin
Feature: Multiple Affiliations

  Scenario: Freeze an affiliation independently
    Given member "Rafael" has 2 active affiliations (A and B)
    When Rafael freezes affiliation A for 15 days
    Then affiliation A should be "frozen"
    And affiliation B should remain "active"
    And Rafael can still access via affiliation B

  Scenario: Prevent freeze during cooldown
    Given affiliation A was unfrozen 30 days ago
    And the cooldown period is 60 days
    When Rafael requests to freeze affiliation A again
    Then the request should be rejected with 422
    And the response should indicate "30 days remaining in cooldown"

  Scenario: Global person block suspends all affiliations
    Given member "Problem User" has 3 active affiliations
    When an admin blocks "Problem User" globally
    Then all 3 affiliations should be "suspended"
    And "Problem User" should be denied access regardless of method
```

---

## Feature: Biometric Enrollment

```gherkin
Feature: Facial Recognition Enrollment

  Scenario: Successful enrollment with consent
    Given member "Carla" has not enrolled biometric
    And staff member initiates enrollment
    And Carla provides written consent
    When Carla completes the 3-angle capture with quality ≥ 0.7
    And the liveness challenge passes
    Then Carla's biometric status should be "enrolled"
    And the template should sync to branch devices

  Scenario: Reject enrollment without consent
    Given member "Marcos" has not provided biometric consent
    When staff attempts to start enrollment for Marcos
    Then the request should be rejected with 422
    And the message should indicate "consent required"

  Scenario: Consent withdrawal deletes all data
    Given member "Carla" has an active biometric profile
    When Carla withdraws biometric consent
    Then facial access should be disabled immediately
    And the backend template should be deleted within 24 hours
    And edge device caches should be purged within 72 hours
    And Carla can still access via QR code
```

---

## Feature: Cycle Management

```gherkin
Feature: Billing Cycles

  Scenario: Carryover unused sessions
    Given an active cycle with 20 allocated sessions and 5 consumed
    And the plan allows 50% carryover (max 10)
    When the cycle closes
    Then 10 sessions should carry over (50% of 20, capped at 10)
    And 5 sessions should be expired
    And the new cycle should have 20 + 10 = 30 available sessions

  Scenario: Carryover sessions expire after 30 days
    Given a cycle with 7 carried-over sessions from previous cycle
    And the carryover expiry is 30 days
    When 30 days into the cycle have passed without using carryover
    Then the 7 carryover sessions should expire
    And a ledger entry with reason "CYCLE_EXPIRATION" should be created
```
