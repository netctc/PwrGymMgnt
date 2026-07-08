import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCurrentEcardSubscription } from '../server/membership';

function createSubscriptionPool(options: { structuredRows?: any[]; legacyRows?: any[] }) {
  const calls: string[] = [];
  return {
    calls,
    async query(sql: string, params: any[] = []) {
      assert.equal(params[0], 'member_1');
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalizedSql);
      if (normalizedSql.includes('FROM member_subscriptions')) {
        return [options.structuredRows || [], []];
      }
      if (normalizedSql.includes('FROM subscriptions s')) {
        return [options.legacyRows || [], []];
      }
      throw new Error(`Unexpected SQL in test: ${normalizedSql}`);
    },
  };
}

test('e-card subscription lookup accepts active member_subscriptions rows with future expiry', async () => {
  const pool = createSubscriptionPool({
    structuredRows: [{
      id: 'sub_1',
      member_id: 'member_1',
      plan_id: 'plan_1',
      plan_name: 'Premium Monthly',
      status: 'Active',
      start_date: '2026-01-01',
      end_date: '2099-01-01',
      price: 89,
      currency: 'USD',
      data: '{}',
    }],
  });

  const subscription = await loadCurrentEcardSubscription(pool as any, 'member_1');

  assert.equal(subscription.id, 'sub_1');
  assert.equal(subscription.plan_name, 'Premium Monthly');
  assert.equal(pool.calls.length, 1, 'legacy table should not be queried when structured subscription is valid');
  assert.match(pool.calls[0], /LOWER\(TRIM\(status\)\) = 'active'/);
  assert.match(pool.calls[0], /DATE\(end_date\) >= CURDATE\(\)/);
});

test('e-card subscription lookup falls back to legacy subscriptions table', async () => {
  const pool = createSubscriptionPool({
    structuredRows: [],
    legacyRows: [{
      id: 'legacy_sub_1',
      member_id: 'member_1',
      plan_id: 'legacy_plan',
      plan_name: 'Legacy Premium',
      status: 'active',
      start_date: null,
      end_date: '2099-02-01',
      price: 75,
      currency: 'USD',
      data: JSON.stringify({ planName: 'Legacy Premium' }),
    }],
  });

  const subscription = await loadCurrentEcardSubscription(pool as any, 'member_1');

  // After migration 023, the legacy table is no longer queried.
  // If member_subscriptions returns nothing, the result is null.
  assert.equal(subscription, null);
  assert.equal(pool.calls.length, 1);
});

test('e-card subscription lookup returns null when no active future expiry exists', async () => {
  const pool = createSubscriptionPool({ structuredRows: [], legacyRows: [] });

  const subscription = await loadCurrentEcardSubscription(pool as any, 'member_1');

  assert.equal(subscription, null);
  assert.equal(pool.calls.length, 1);
});

test('e-card WhatsApp configuration helper requires token and phone number id', async () => {
  const { isEcardWhatsAppConfigured, getEcardWhatsAppConfigurationError } = await import('../server/membership');

  assert.equal(isEcardWhatsAppConfigured({ WHATSAPP_CLOUD_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: 'phone_id' } as any), true);
  assert.equal(isEcardWhatsAppConfigured({ WHATSAPP_CLOUD_TOKEN: 'token' } as any), false);
  assert.equal(isEcardWhatsAppConfigured({ WHATSAPP_PHONE_NUMBER_ID: 'phone_id' } as any), false);
  assert.match(getEcardWhatsAppConfigurationError(), /WHATSAPP_CLOUD_TOKEN/);
});
