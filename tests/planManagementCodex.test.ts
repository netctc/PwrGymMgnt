import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("plan management module exposes versioned plans and list maintenance", () => {
  const source = read("server/planManagement.ts");
  assert.match(source, /registerPlanManagementRoutes/);
  assert.match(source, /\/api\/v2\/plan-management\/plans/);
  assert.match(source, /\/api\/v2\/list-maintenance/);
  assert.match(source, /individual.*family.*group.*corporate/);
  assert.match(source, /draft.*active.*suspended.*cancelled.*archived/);
});

test("multi-user member contract covers capacity, new members, history and future bookings", () => {
  const source = read("server/planManagement.ts");
  const subscriptions = read("server/subscriptionsV2.ts");
  const lifecycle = read("server/subscriptionLifecycle.ts");
  const subscriptionsListRoute = subscriptions.slice(
    subscriptions.indexOf('app.get("/api/v2/subscriptions"'),
    subscriptions.indexOf('app.post("/api/v2/subscriptions"'),
  );
  const subscriptionMembersListRoute = subscriptions.slice(
    subscriptions.indexOf(
      'app.get("/api/v2/subscriptions/:id/members"',
    ),
    subscriptions.indexOf(
      'app.post("/api/v2/subscriptions/:id/members"',
    ),
  );
  const subscriptionCreationRoute = subscriptions.slice(
    subscriptions.indexOf('app.post("/api/v2/subscriptions"'),
    subscriptions.indexOf(
      'app.patch("/api/v2/subscriptions/:id/payment-status"',
    ),
  );
  assert.match(source, /CAPACITY_LIMIT_REACHED/);
  assert.match(source, /newMember/);
  assert.match(source, /email address or phone number is required for a new member/);
  assert.match(source, /status IN \('active', 'suspended'\)/);
  assert.match(source, /subscription_member_history/);
  assert.match(source, /futureBookingPolicy/);
  assert.match(source, /benefits_override/);
  assert.match(source, /restrictions_override/);
  assert.match(subscriptions, /sm_filter\.member_id = \?/);
  assert.match(subscriptions, /status IN \('active', 'suspended'\)/);
  assert.match(subscriptions, /holder\.first_name AS holder_first_name/);
  assert.doesNotMatch(
    subscriptionsListRoute,
    /requireFeature/,
    "existing subscriptions must remain readable when rollout flags are off",
  );
  assert.doesNotMatch(
    subscriptionMembersListRoute,
    /requireFeature/,
    "existing beneficiaries must remain readable when rollout flags are off",
  );
  assert.doesNotMatch(
    subscriptionCreationRoute,
    /requireFeature/,
    "standard subscription creation must remain operational when rollout flags are off",
  );
  assert.match(lifecycle, /currentEnd >= today/);
  assert.match(lifecycle, /a\.end_date = \?/);
  assert.match(lifecycle, /sm\.status IN \('active', 'suspended'\)/);
});

test("migration seeds bilingual database-backed lists", () => {
  const sql = read("sql/021_plan_management_and_list_maintenance.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS maintenance_lists/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS maintenance_list_items/);
  assert.match(sql, /label_en/);
  assert.match(sql, /label_ar/);
  assert.match(sql, /mli_plan_individual/);
  assert.match(sql, /mli_plan_family/);
  assert.match(sql, /mli_plan_group/);
  assert.match(sql, /mli_plan_corporate/);
});

test("multi-user business rules synchronize expiry, preserve history and protect the holder", () => {
  const management = read("server/planManagement.ts");
  const lifecycle = read("server/subscriptionLifecycle.ts");
  const membership = read("server/membership.ts");
  const managementPage = read("src/pages/MultiUserMemberships.tsx");
  const membersPage = read("src/pages/Members.tsx");
  const api = read("src/lib/planManagementApi.ts");

  assert.match(management, /beneficiary_expiry_changed/);
  assert.match(management, /BENEFICIARY_DURATION_LIMIT/);
  assert.match(management, /SUBSCRIPTION_EXPIRED/);
  assert.match(management, /subscriptions\/:subscriptionId\/members\/:memberId\/expiry/);
  assert.match(management, /subscriptions\/:id\/holder/);
  assert.match(management, /holder_transferred_out/);
  assert.match(management, /holder_transferred_in/);
  assert.match(management, /new holder must be an active beneficiary/i);
  assert.match(lifecycle, /subscription_renewed/);
  assert.match(lifecycle, /beneficiaries: beneficiaryRows\.map/);
  assert.match(lifecycle, /JSON_REMOVE[\s\S]*expiryOverride/);
  assert.match(membership, /ACTIVE_MULTI_USER_HOLDER/);
  assert.match(membership, /assertMemberCanBeRestricted/);
  assert.match(membership, /subscriptionType: "multi_user"/);
  assert.match(membership, /multiUserRole/);
  assert.match(
    membership,
    /COALESCE\(sp\.description, pv\.description\) AS plan_description/,
  );
  assert.match(api, /updateBeneficiaryExpiry/);
  assert.match(api, /changeSubscriptionHolder/);
  assert.match(managementPage, /canModifyBeneficiaries/);
  assert.match(managementPage, /changeHolder/);
  assert.match(managementPage, /maximumEndDate/);
  assert.match(membersPage, /Multi-user ·/);
  assert.match(membersPage, /holderActionLocked/);
});

test("frontend routes plans to the new page and exposes settings list maintenance", () => {
  const app = read("src/App.tsx");
  const settings = read("src/pages/Settings.tsx");
  assert.match(app, /MembershipPlansCodex/);
  assert.match(app, /HybridSubscriptionWizard/);
  assert.match(app, /subscriptions\/new-hybrid/);
  assert.match(app, /settings\/list-maintenance/);
  assert.match(settings, /listMaintenanceLabel/);
});

test("trainer plan assignments are versioned, audited and settled outside fixed payroll", () => {
  const management = read("server/planManagement.ts");
  const commissions = read("server/trainerCommissions.ts");
  const subscriptions = read("server/subscriptionsV2.ts");
  const lifecycle = read("server/subscriptionLifecycle.ts");
  const migration = read("sql/026_trainer_plan_commissions.sql");
  const plansPage = read("src/pages/MembershipPlansCodex.tsx");
  const commissionsPage = read("src/pages/TrainerCommissions.tsx");
  const membership = read("server/membership.ts");
  const membershipApi = read("src/lib/membershipApi.ts");
  const membersPage = read("src/pages/Members.tsx");
  const workers = read("server/workers.ts");
  const alertMigration = read("sql/027_member_session_history_alerts.sql");
  const partialPaymentMigration = read("sql/028_trainer_commission_partial_payments.sql");
  const app = read("src/App.tsx");

  assert.match(management, /trainerCommissionPercent/);
  assert.match(management, /trainer_commission_percent/);
  assert.match(management, /trainer_plan_assignment_history/);
  assert.match(management, /A trainer is required when a commission percentage is configured/);
  assert.match(management, /percentage must be between 0 and 100/);
  assert.match(management, /WHERE e\.id = \? AND e\.employment_status = 'active'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS trainer_plan_commissions/);
  assert.match(migration, /UNIQUE KEY uq_trainer_commission_cycle/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS trainer_plan_assignment_history/);
  assert.match(commissions, /upsertTrainerPlanCommission/);
  assert.match(commissions, /Trainer Plan Commission/);
  assert.match(commissions, /'expense'/);
  assert.match(commissions, /separateFromPayroll: true/);
  assert.match(commissions, /ON DUPLICATE KEY UPDATE/);
  assert.match(commissions, /export\.csv/);
  assert.match(commissions, /export\.pdf/);
  assert.match(commissions, /pay-partial/);
  assert.match(commissions, /effectiveConsumedSessions/);
  assert.match(commissions, /COMMISSION_TOTAL_EXCEEDED/);
  assert.match(commissions, /No new consumed sessions are available for partial payment/);
  assert.match(commissions, /trainer_commission_partially_paid/);
  assert.match(commissions, /commission_liability_settlement_no_duplicate_expense/);
  assert.match(commissions, /due_date = VALUES\(due_date\)/);
  assert.match(commissions, /private_sessions/);
  assert.match(commissions, /class_sessions/);
  assert.match(commissions, /trainer-commissions\/employees/);
  assert.match(commissions, /WHERE e\.employment_status = 'active'/);
  assert.match(subscriptions, /upsertTrainerPlanCommission/);
  assert.match(lifecycle, /upsertTrainerPlanCommission/);
  assert.match(plansPage, /assignedTrainer/);
  assert.match(plansPage, /trainerCommissionPercent/);
  assert.match(commissionsPage, /Commission history/);
  assert.match(commissionsPage, /Mark paid/);
  assert.match(commissionsPage, /Partial paid/);
  assert.match(commissionsPage, /Payment history/);
  assert.match(commissionsPage, /amountPending/);
  assert.match(commissionsPage, /Fixed monthly salary remains separate/);
  assert.match(commissionsPage, /formatDateTime/);
  assert.doesNotMatch(commissionsPage, /\bformatDate\(/);
  assert.match(membership, /session-history\.pdf/);
  assert.match(membership, /Member plan and session history/);
  assert.match(membership, /Unconsumed sessions by cycle/);
  assert.match(membership, /member_session_history_pdf_exported/);
  assert.match(membershipApi, /downloadMemberSessionHistory/);
  assert.match(membersPage, /downloadMemberSessionHistory/);
  assert.match(membersPage, /trainerName/);
  assert.match(workers, /notifyExpiringSessionBalances/);
  assert.match(workers, /session_expiry_alert/);
  assert.match(alertMigration, /ml_session_expiry_alerts/);
  assert.match(partialPaymentMigration, /CREATE TABLE IF NOT EXISTS trainer_commission_payments/);
  assert.match(partialPaymentMigration, /idempotency_key/);
  assert.match(partialPaymentMigration, /authorized_by/);
  assert.match(partialPaymentMigration, /subscription\.end_date/);
  assert.match(alertMigration, /label_ar/);
  assert.match(app, /trainer-commissions/);
});

test("hybrid subscription flow is atomic and supports deferred member assignment", () => {
  const server = read("server/planManagement.ts");
  const wizard = read("src/pages/HybridSubscriptionWizard.tsx");
  const management = read("src/pages/MultiUserMemberships.tsx");
  const members = read("src/pages/Members.tsx");
  const api = read("src/lib/planManagementApi.ts");
  assert.match(server, /subscriptions\/hybrid/);
  assert.match(server, /api\/v2\/subscriptions\/hybrid/);
  assert.match(server, /beginTransaction/);
  assert.match(server, /rollback/);
  assert.match(server, /addMembersNow/);
  assert.match(server, /email address or phone number/);
  assert.match(server, /subscriptions\/:id\/dates/);
  assert.match(wizard, /createHybridSubscription/);
  assert.match(wizard, /createCompatibleSubscription/);
  assert.match(wizard, /holderMemberId/);
  assert.match(wizard, /automaticEnd/);
  assert.match(wizard, /existingHolder/);
  assert.match(wizard, /Complete later/);
  assert.match(api, /error\.status = response\.status/);
  assert.match(management, /updateSubscriptionDates/);
  assert.match(management, /subscriptionId/);
  assert.match(management, /requestedMemberId/);
  assert.match(management, /listMaintenance\(\)[\s\S]*?\.catch/);
  assert.match(management, /searchExistingMembers/);
  assert.match(management, /contactRequired/);
  assert.match(management, /listSubscriptionMembers\(subscriptionId\)/);
  assert.match(management, /item\.holderName \|\| item\.holderMemberId/);
  assert.match(members, /renewMultiSubscription/);
  assert.match(members, /sm:max-w-2xl/);
  assert.match(members, /max-h-\[90vh\]/);
  assert.match(members, /flex flex-wrap justify-end/);
  assert.match(members, /subscriptionsV2Api\.renewSubscription/);
  assert.match(members, /New multi-user subscription/);
  assert.match(members, /Manage beneficiaries/);
});

test("limited multi-user plans expose distribution, cycles, immutable movements and payment controls", () => {
  const management = read("server/planManagement.ts");
  const cycles = read("server/subscriptionCycles.ts");
  const subscriptions = read("server/subscriptionsV2.ts");
  const lifecycle = read("server/subscriptionLifecycle.ts");
  const payments = read("server/subscriptionPaymentRules.ts");
  const scheduling = read("server/scheduling.ts");
  const plansPage = read("src/pages/MembershipPlansCodex.tsx");
  const subscriptionsPage = read("src/pages/Subscriptions.tsx");
  const membersPage = read("src/pages/Members.tsx");
  const membership = read("server/membership.ts");
  const migration = read("sql/024_session_distribution_payment_lists.sql");
  const affiliationMigration = read("sql/025_affiliation_selection_deduplication.sql");
  const access = read("server/accessAuthorization.ts");
  const ledger = read("server/sessionLedger.ts");
  const listMaintenance = read("src/pages/ListMaintenance.tsx");
  const accessPage = read("src/pages/AccessControl.tsx");
  const qrScannerPage = read("src/pages/QRScanner.tsx");
  const layout = read("src/components/Layout.tsx");
  const privateClassesPage = read("src/pages/PrivateClasses.tsx");
  const schedulingApi = read("src/lib/schedulingApi.ts");
  const reports = read("server/reports.ts");
  const commissions = read("server/trainerCommissions.ts");
  const commissionsPage = read("src/pages/TrainerCommissions.tsx");
  const dashboardPage = read("src/pages/Dashboard.tsx");
  const wizard = read("src/pages/HybridSubscriptionWizard.tsx");
  const subscriptionsApi = read("src/lib/subscriptionsV2Api.ts");
  const planManagementApi = read("src/lib/planManagementApi.ts");
  const contractCreation = read("server/domain/v2/contractCreation.ts");

  assert.match(management, /holderSessionsPerCycle/);
  assert.match(management, /beneficiarySessionsPerCycle/);
  assert.match(management, /carryoverExpiryDays/);
  assert.match(management, /deductionMoment/);
  assert.match(cycles, /distributionModel === "shared"/);
  assert.match(cycles, /distributionModel === "individual"/);
  assert.match(cycles, /distributionModel === "custom"/);
  assert.match(cycles, /allocateAffiliationInActiveCycle/);
  assert.match(subscriptions, /session-summary/);
  assert.match(subscriptions, /sessions\/purchase/);
  assert.match(subscriptions, /sessions\/register-event/);
  assert.match(subscriptions, /DEDUCTION_DEFERRED/);
  assert.match(subscriptions, /payment-status/);
  assert.match(subscriptions, /subscription_v2_payment/);
  assert.match(subscriptions, /accountingStatus/);
  assert.match(subscriptions, /const accountingStatus = receivedMinor > 0n \? "posted" : "pending"/);
  assert.match(subscriptions, /PAID_SUBSCRIPTION_LOCKED/);
  assert.match(subscriptions, /createInvoiceNumber/);
  assert.match(subscriptions, /subscriptionV2Id/);
  assert.match(subscriptions, /invoiceNumber/);
  assert.match(subscriptions, /subscription_v2_renewal_invoice/);
  assert.match(subscriptions, /paymentDate/);
  assert.match(contractCreation, /DUPLICATE_ACTIVE_PLAN/);
  assert.match(subscriptions, /estimated payment date cannot be in the past/i);
  assert.match(payments, /OUTSTANDING_SUBSCRIPTION_PAYMENT/);
  assert.match(lifecycle, /current subscription payment must be settled/i);
  assert.match(lifecycle, /estimated payment date cannot be after the subscription end date/i);
  assert.match(lifecycle, /subscription_v2_renewal_invoice/);
  assert.match(scheduling, /late_cancellation_penalty/);
  assert.match(scheduling, /deductionDeferredUntil/);
  assert.match(plansPage, /lateCancellationThreshold/);
  assert.match(plansPage, /allowExtraSessions/);
  assert.match(subscriptionsPage, /sessionsContracted/);
  assert.match(subscriptionsPage, /sessionsConsumed/);
  assert.match(subscriptionsPage, /sessionsRemaining/);
  assert.match(membersPage, /paymentAttentionRequired/);
  assert.match(membersPage, /expandedPlanKey/);
  assert.match(membersPage, /New Subscriptions/);
  assert.match(membersPage, /member\.plans/);
  assert.match(membersPage, /openNewSubscription\(newMember\)/);
  assert.match(membersPage, /newSubscriptionRequiresMemberSelection/);
  assert.match(membersPage, /planManagementApi\.listPlans/);
  assert.match(membersPage, /plan\.planType === 'individual'/);
  assert.match(membersPage, /activePlanIds\.has\(plan\.id\)/);
  assert.match(membersPage, /activePlanVersionIds\.has\(plan\.planVersionId\)/);
  assert.match(membership, /s\.plan_id/);
  assert.match(membersPage, /sessionsConsumed/);
  assert.match(membersPage, /sessionsPending/);
  assert.match(membersPage, /multiUserMembers/);
  assert.match(membersPage, /multiUserCapacity/);
  assert.match(membersPage, /Payment pending/);
  assert.match(membersPage, /Paid subscriptions are locked/);
  assert.match(membersPage, /renewPaymentStatus/);
  assert.match(membersPage, /renewPaymentDate/);
  assert.match(membersPage, /setRenewPlanId\(''\)/);
  assert.match(membersPage, /setRenewPlanVersionId\(multiSubscription\.planVersionId\)/);
  assert.match(membersPage, /activeRenewalManagedPlans\.map/);
  assert.doesNotMatch(
    membersPage,
    /disabled=\{Boolean\(renewMultiSubscription\) \|\| renewMode === 'edit'\}/,
  );
  assert.match(membersPage, /Number\.isNaN\(value\.getTime\(\)\)/);
  assert.match(subscriptionsApi, /planVersionId\?: string/);
  assert.match(lifecycle, /requestedPlanVersionId/);
  assert.match(lifecycle, /PLAN_CAPACITY_EXCEEDED/);
  assert.match(lifecycle, /Number\.isNaN\(sub\.end_date\.getTime\(\)\)/);
  assert.match(membersPage, /Estimated payment date cannot be after End Date/);
  assert.match(membersPage, /renewMode/);
  assert.match(membersPage, /Subscription payment updated/);
  assert.match(membersPage, /Current Plan/);
  assert.match(membersPage, /Payment Status/);
  assert.match(membersPage, /Expiry Date/);
  assert.match(membersPage, /Sort by/);
  assert.match(membersPage, /Members per page/);
  assert.match(membersPage, /paginationPages/);
  assert.match(membership, /currentPlanFilter/);
  assert.match(membership, /paymentStatusFilter/);
  assert.match(membership, /expiryDateFilter/);
  assert.match(membership, /pageSize/);
  assert.match(migration, /mli_cycle_quarterly/);
  assert.match(migration, /mli_payment_overdue/);
  assert.match(affiliationMigration, /ml_consumption_deduplication/);
  assert.match(affiliationMigration, /session_activity_claims/);
  assert.match(access, /reservationAffiliationId/);
  assert.match(access, /AFFILIATION_SELECTION_REQUIRED/);
  assert.match(access, /SESSION_CONSUMPTION_CONFIRMATION_REQUIRED/);
  assert.match(access, /SESSION_ACTION_REQUIRED/);
  assert.match(access, /SESSION_RECOVERED/);
  assert.match(access, /access_session_recovery/);
  assert.match(access, /relatedMovementId: original\.id/);
  assert.match(access, /RECOVERY_REASON_REQUIRED/);
  assert.match(access, /session_recovered/);
  assert.match(
    access,
    /createHash\("sha256"\)\.update\(rawAccessToken\)\.digest\("hex"\)/,
  );
  assert.match(access, /at\.revoked_at IS NULL/);
  assert.match(access, /checkAndClaimCooldown/);
  assert.doesNotMatch(
    access.slice(
      access.indexOf('app.post("/api/access/authorize"'),
      access.indexOf('// Access attempts history'),
    ),
    /ENABLE_UNIFIED_ACCESS/,
  );
  assert.match(accessPage, /Deduct session/);
  assert.match(accessPage, /Recover session/);
  assert.match(accessPage, /recoveryReason/);
  assert.match(qrScannerPage, /accessToken: cleanedToken/);
  assert.match(qrScannerPage, /decision\.requiresSessionAction/);
  assert.match(qrScannerPage, /handleSessionAction/);
  assert.match(qrScannerPage, /Deduct session/);
  assert.match(qrScannerPage, /Recover session/);
  assert.match(scheduling, /limitedMembers/);
  assert.match(scheduling, /AND EXISTS \(/);
  assert.match(scheduling, /LOWER\(TRIM\(m\.status\)\) = 'active'/);
  assert.match(scheduling, /LOWER\(TRIM\(a\.status\)\) = 'active'/);
  assert.match(scheduling, /LIMITED_SESSION_PLAN_REQUIRED/);
  assert.match(scheduling, /deductionDeferredUntil: "check_in"/);
  assert.match(privateClassesPage, /limitedMembers\.map/);
  assert.match(schedulingApi, /limitedMembers: SchedulingPerson\[\]/);
  assert.match(subscriptions, /memberStatus/);
  assert.match(subscriptions, /paymentStatus/);
  assert.match(subscriptions, /sessions_contracted/);
  assert.match(subscriptions, /return-latest/);
  assert.match(subscriptions, /NO_RETURNABLE_SESSION/);
  assert.match(subscriptionsPage, /individual_unlimited/);
  assert.match(subscriptionsPage, /individual_limited/);
  assert.match(subscriptionsPage, /multi_user/);
  assert.match(subscriptionsPage, /adjustSessions/);
  assert.match(subscriptionsPage, /returnLatestSession/);
  assert.match(subscriptions, /subscription_session_history_pdf_exported/);
  assert.match(subscriptions, /session-history\.pdf/);
  assert.match(subscriptions, /subscription_session_deducted/);
  assert.match(subscriptions, /subscription_session_returned/);
  assert.match(subscriptions, /reversal\.related_movement_id = movement\.id/);
  assert.match(subscriptions, /pv\.trainer_id, pv\.trainer_name/);
  assert.match(subscriptions, /s\.end_date >= \?/);
  assert.match(subscriptions, /s\.start_date <= \?/);
  assert.match(subscriptionsPage, /downloadSessionHistoryPdf/);
  assert.match(subscriptionsPage, /subscription\.trainerName \|\| 'N\/A'/);
  assert.match(subscriptionsPage, /trainerOptions/);
  assert.match(subscriptionsPage, /planType/);
  assert.match(subscriptionsPage, /DateInput/);
  assert.match(commissions, /PENDING_CUSTOMER_PAYMENT_CONFIRMATION_REQUIRED/);
  assert.match(commissions, /trainer_commission_paid_before_customer_collection/);
  assert.match(commissionsPage, /pendingPaymentWarning/);
  assert.match(membersPage, /String\(qrMember\.status\)\.toLowerCase\(\) !== 'active'/);
  assert.match(layout, /'nav\.subscriptions', path: '\/subscriptions'/);
  assert.match(ledger, /DUPLICATE_ACTIVITY/);
  assert.match(listMaintenance, /intervalSeconds/);
  assert.match(reports, /import \{ autoTable \} from "jspdf-autotable"/);
  assert.match(reports, /id: "consumed-sessions"/);
  assert.match(reports, /Consumed Sessions Report/);
  assert.match(dashboardPage, /members\?subscriptionStatus=active/);
  assert.match(dashboardPage, /private-classes\?view=list&date=today/);
  assert.match(membership, /subscriptionStatusFilter/);
  assert.match(privateClassesPage, /Class type \/ level/);
  assert.match(privateClassesPage, /Classes per page/);
  assert.match(privateClassesPage, /listPagination/);
  assert.match(privateClassesPage, /max-h-\[70vh\] overflow-auto/);
  assert.match(privateClassesPage, /Duration/);
  assert.match(privateClassesPage, /session\.notes/);
  assert.match(scheduling, /private_pt_filters_applied/);
  assert.doesNotMatch(
    scheduling.slice(
      scheduling.indexOf('app.get("/api/scheduling/private-classes"'),
      scheduling.indexOf('app.post("/api/scheduling/private-classes"'),
    ),
    /Date\.now\(\) [-+] .*24 \* 60 \* 60 \* 1000/,
  );
  assert.match(lifecycle, /confirmOutstandingPayment/);
  assert.match(lifecycle, /subscription_renewed_with_outstanding_payment/);
  assert.match(subscriptions, /OUTSTANDING_SUBSCRIPTION_PAYMENT_CONFIRMATION_REQUIRED/);
  assert.match(subscriptions, /subscription_created_with_pending_payment_confirmed/);
  assert.match(subscriptions, /subscription_creation_with_pending_payment_cancelled/);
  assert.match(subscriptions, /findOutstandingSubscriptionPayment/);
  assert.match(membersPage, /recordPendingPaymentDecision/);
  assert.match(membersPage, /confirmOutstandingPayment: true/);
  assert.match(membersPage, /active or inactive plan with a pending payment/);
  assert.match(subscriptionsApi, /typeof apiError === 'string'/);
  assert.match(subscriptionsApi, /apiError\?\.message/);
  assert.match(management, /multi_user_subscription_created_with_pending_payment_confirmed/);
  assert.match(management, /OUTSTANDING_SUBSCRIPTION_PAYMENT_CONFIRMATION_REQUIRED/);
  assert.match(wizard, /pendingPaymentWarning/);
  assert.match(wizard, /recordPendingPaymentDecision/);
  assert.match(wizard, /confirmOutstandingPayment: true/);
  assert.match(planManagementApi, /typeof apiError === "string"/);
  assert.match(membership, /member_directory_filters_applied/);
  assert.match(reports, /report_pdf_downloaded/);
});
