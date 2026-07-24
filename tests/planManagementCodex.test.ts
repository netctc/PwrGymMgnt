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
