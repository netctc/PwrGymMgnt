import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('shared pagination exposes consistent page sizes', () => {
  const pagination = source('src/components/ListPagination.tsx');
  assert.match(pagination, /pageSizeOptions = \[10, 25, 50\]/);
  assert.match(pagination, /Math\.ceil\(total \/ pageSize\)/);
  assert.match(pagination, /Previous/);
  assert.match(pagination, /Next/);
});

test('operational directories use shared pagination', () => {
  for (const page of [
    'Subscriptions.tsx',
    'Classes.tsx',
    'MembershipPlansCodex.tsx',
    'TrainerCommissions.tsx',
    'HumanResources.tsx',
    'Accounting.tsx',
    'Warehouse.tsx',
  ]) {
    assert.match(source(`src/pages/${page}`), /ListPagination/, `${page} must use ListPagination`);
  }
});

test('class list supports date, type and trainer filters', () => {
  const classes = source('src/pages/Classes.tsx');
  assert.match(classes, /listFrom/);
  assert.match(classes, /listTo/);
  assert.match(classes, /listType/);
  assert.match(classes, /listTrainerId/);
  assert.match(classes, /max-h-\[70vh\] overflow-auto/);
});

test('warehouse lists do not truncate products or recent sales with fixed slices', () => {
  const warehouse = source('src/pages/Warehouse.tsx');
  assert.doesNotMatch(warehouse, /filteredProducts\.slice\(0,\s*100\)/);
  assert.doesNotMatch(warehouse, /sales\.slice\(0,\s*15\)/);
  assert.doesNotMatch(warehouse, /\.slice\(0,\s*36\)/);
});

test('member report exposes requested plan, subscription and payment filters', () => {
  const reports = source('server/reports.ts');
  assert.match(reports, /id: "currentPlan", label: "Current Plan", type: "select"/);
  assert.match(reports, /id: "subscriptionStatus", label: "Subscription Status"/);
  assert.match(reports, /id: "paymentStatus", label: "Payment Status"/);
  assert.match(reports, /loadMembersDirectoryFilterOptions/);
  assert.match(reports, /maintenance_list_items/);
  assert.match(reports, /GROUP_CONCAT\(DISTINCT active_plans\.plan_name/);
  assert.match(reports, /customFilters:[\s\S]*currentPlan:[\s\S]*filter_affiliation/);
  assert.doesNotMatch(reports, /id: "currentPlan", label: "Current Plan", type: "text"/);
});

test('member and payment statuses are loaded from maintenance lists', () => {
  const members = source('src/pages/Members.tsx');
  const subscriptions = source('src/pages/Subscriptions.tsx');
  for (const page of [members, subscriptions]) {
    assert.match(page, /planManagementApi\.listMaintenance/);
    assert.match(page, /member_status/);
    assert.match(page, /payment_status/);
  }
});
