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
  assert.match(lifecycle, /currentEnd >= today/);
  assert.match(lifecycle, /SET a\.end_date = \?/);
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
  const reports = read("server/reports.ts");

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
  assert.match(subscriptions, /paymentStatus === "paid" \? "posted" : "pending"/);
  assert.match(subscriptions, /PAID_SUBSCRIPTION_LOCKED/);
  assert.match(subscriptions, /createInvoiceNumber/);
  assert.match(subscriptions, /subscriptionV2Id/);
  assert.match(subscriptions, /invoiceNumber/);
  assert.match(subscriptions, /subscription_v2_renewal_invoice/);
  assert.match(subscriptions, /paymentDate/);
  assert.match(subscriptions, /estimated payment date cannot be in the past/i);
  assert.match(payments, /OUTSTANDING_SUBSCRIPTION_PAYMENT/);
  assert.match(lifecycle, /current subscription payment must be settled/i);
  assert.match(lifecycle, /estimated payment date cannot be after the subscription end date/i);
  assert.match(lifecycle, /subscription_v2_renewal_invoice/);
  assert.match(scheduling, /late_cancellation_penalty/);
  assert.match(scheduling, /deductionDeferredUntil/);
  assert.match(plansPage, /lateCancellationThreshold/);
  assert.match(plansPage, /allowExtraSessions/);
  assert.match(subscriptionsPage, /Real-time session summary/);
  assert.match(membersPage, /paymentAttentionRequired/);
  assert.match(membersPage, /expandedPlanMemberId/);
  assert.match(membersPage, /multiUserMembers/);
  assert.match(membersPage, /multiUserCapacity/);
  assert.match(membersPage, /Payment pending/);
  assert.match(membersPage, /Paid subscriptions are locked/);
  assert.match(membersPage, /renewPaymentStatus/);
  assert.match(membersPage, /renewPaymentDate/);
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
  assert.match(reports, /import \{ autoTable \} from "jspdf-autotable"/);
});
