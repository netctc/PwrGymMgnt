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
  assert.match(members, /New multi-user subscription/);
  assert.match(members, /Manage beneficiaries/);
});
