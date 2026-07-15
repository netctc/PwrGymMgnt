/**
 * Evolution API Documentation — OpenAPI/Swagger specs for V2 endpoints.
 * Serves at /api-docs/evolution when API docs are enabled.
 */

import type { Express } from "express";

const EVOLUTION_OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "PowerGym Evolution API",
    version: "2.0.0",
    description: "Multi-user plans, session ledger, unified access, biometric profiles.",
  },
  paths: {
    "/api/v2/plan-versions": {
      get: { summary: "List plan versions", tags: ["Plans"], parameters: [{ name: "planId", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Plan versions list" } } },
      post: { summary: "Create plan version", tags: ["Plans"], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/PlanVersionCreate" } } } }, responses: { 201: { description: "Created" } } },
    },
    "/api/v2/subscriptions": {
      get: { summary: "List subscriptions", tags: ["Subscriptions"], parameters: [{ name: "memberId", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Subscriptions list" } } },
      post: { summary: "Create subscription", tags: ["Subscriptions"], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/SubscriptionCreate" } } } }, responses: { 201: { description: "Created with affiliation" } } },
    },
    "/api/v2/subscriptions/{id}/members": {
      get: { summary: "List subscription members", tags: ["Subscriptions"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Members list" } } },
      post: { summary: "Add beneficiary", tags: ["Subscriptions"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 201: { description: "Member added" }, 409: { description: "Capacity reached" } } },
    },
    "/api/v2/subscriptions/{id}/freeze": { post: { summary: "Freeze subscription", tags: ["Lifecycle"], responses: { 200: { description: "Frozen" }, 409: { description: "Invalid transition" } } } },
    "/api/v2/subscriptions/{id}/suspend": { post: { summary: "Suspend subscription", tags: ["Lifecycle"], responses: { 200: { description: "Suspended" } } } },
    "/api/v2/subscriptions/{id}/reactivate": { post: { summary: "Reactivate subscription", tags: ["Lifecycle"], responses: { 200: { description: "Reactivated" } } } },
    "/api/v2/subscriptions/{id}/cancel": { post: { summary: "Cancel subscription (terminal)", tags: ["Lifecycle"], responses: { 200: { description: "Cancelled" } } } },
    "/api/v2/subscriptions/{id}/renew": { post: { summary: "Renew expired subscription", tags: ["Lifecycle"], responses: { 200: { description: "Renewed" } } } },
    "/api/v2/subscriptions/{id}/change-plan": { post: { summary: "Change plan version", tags: ["Lifecycle"], responses: { 200: { description: "Plan changed" } } } },
    "/api/v2/affiliations": {
      get: { summary: "List affiliations for a member", tags: ["Affiliations"], parameters: [{ name: "memberId", in: "query", required: true, schema: { type: "string" } }], responses: { 200: { description: "Affiliations list" } } },
    },
    "/api/v2/session-balances": {
      get: { summary: "Get session balances", tags: ["Sessions"], parameters: [{ name: "affiliationId", in: "query", schema: { type: "string" } }, { name: "subscriptionId", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Balances" } } },
    },
    "/api/v2/session-movements": {
      get: { summary: "Get session movement history", tags: ["Sessions"], responses: { 200: { description: "Movements list" } } },
    },
    "/api/v2/sessions/consume": { post: { summary: "Consume a session", tags: ["Sessions"], requestBody: { content: { "application/json": { schema: { type: "object", properties: { affiliationId: { type: "string" }, quantity: { type: "integer", default: 1 } }, required: ["affiliationId"] } } } }, responses: { 201: { description: "Consumed" }, 400: { description: "NO_SESSIONS_AVAILABLE" } } } },
    "/api/v2/sessions/reserve": { post: { summary: "Reserve a session", tags: ["Sessions"], responses: { 201: { description: "Reserved" } } } },
    "/api/v2/sessions/refund": { post: { summary: "Refund a session", tags: ["Sessions"], responses: { 201: { description: "Refunded" } } } },
    "/api/v2/sessions/adjust": { post: { summary: "Administrative adjustment", tags: ["Sessions"], responses: { 201: { description: "Adjusted" } } } },
    "/api/v2/sessions/reconcile": { post: { summary: "Reconcile balances vs movements", tags: ["Operations"], responses: { 200: { description: "Reconciliation result" } } } },
    "/api/access/authorize": { post: { summary: "Unified access authorization", tags: ["Access"], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/AccessRequest" } } } }, responses: { 200: { description: "Authorized" }, 403: { description: "Denied" } } } },
    "/api/access/attempts": { get: { summary: "Access attempts history", tags: ["Access"], responses: { 200: { description: "Attempts list" } } } },
    "/api/access/points": {
      get: { summary: "List access points", tags: ["Access"], responses: { 200: { description: "Access points" } } },
      post: { summary: "Create access point", tags: ["Access"], responses: { 201: { description: "Created" } } },
    },
    "/api/biometrics/consents": {
      get: { summary: "List biometric consents", tags: ["Biometrics"], responses: { 200: { description: "Consents" } } },
      post: { summary: "Grant or withdraw consent", tags: ["Biometrics"], responses: { 201: { description: "Recorded" } } },
    },
    "/api/biometrics/profiles": {
      get: { summary: "List biometric profiles", tags: ["Biometrics"], responses: { 200: { description: "Profiles (no templates)" } } },
      post: { summary: "Enroll biometric profile", tags: ["Biometrics"], responses: { 201: { description: "Enrolled" }, 400: { description: "Consent required" } } },
    },
    "/api/biometrics/profiles/{id}/revoke": { post: { summary: "Revoke profile", tags: ["Biometrics"], responses: { 200: { description: "Revoked" } } } },
    "/api/biometrics/profiles/{id}/delete": { post: { summary: "Request deletion (GDPR)", tags: ["Biometrics"], responses: { 200: { description: "Deletion scheduled" } } } },
    "/api/v2/dashboard/summary": { get: { summary: "Evolution system metrics", tags: ["Dashboard"], responses: { 200: { description: "Full metrics" } } } },
    "/api/v2/dashboard/access-trends": { get: { summary: "7-day access trends", tags: ["Dashboard"], responses: { 200: { description: "Trends" } } } },
    "/api/v2/dashboard/top-consumers": { get: { summary: "Top session consumers (30d)", tags: ["Dashboard"], responses: { 200: { description: "Leaderboard" } } } },
    "/api/member-portal/my-affiliations": { get: { summary: "My affiliations + balances", tags: ["Member Portal"], responses: { 200: { description: "Self-service data" } } } },
    "/api/member-portal/my-access": { get: { summary: "My access history", tags: ["Member Portal"], responses: { 200: { description: "Last 20 attempts" } } } },
    "/api/member-portal/my-movements": { get: { summary: "My session movements", tags: ["Member Portal"], responses: { 200: { description: "Last 30 movements" } } } },
    "/api/v2/feature-flags": { get: { summary: "List feature flags", tags: ["Operations"], responses: { 200: { description: "Flags" } } } },
    "/api/v2/feature-flags/{key}": { put: { summary: "Toggle feature flag", tags: ["Operations"], responses: { 200: { description: "Toggled" } } } },
    "/api/v2/workers/run-cycles": { post: { summary: "Trigger cycle processing", tags: ["Operations"], responses: { 200: { description: "Result" } } } },
    "/api/v2/workers/drain-outbox": { post: { summary: "Trigger outbox drain", tags: ["Operations"], responses: { 200: { description: "Result" } } } },
    "/api/v2/workers/release-expired": { post: { summary: "Release expired reservations", tags: ["Operations"], responses: { 200: { description: "Result" } } } },
  },
  components: {
    schemas: {
      PlanVersionCreate: { type: "object", properties: { planId: { type: "string" }, name: { type: "string" }, planType: { type: "string", enum: ["individual", "family", "group", "corporate"] }, price: { type: "number" }, durationDays: { type: "integer" }, maxMembers: { type: "integer" }, sessionsUnlimited: { type: "boolean" }, sessionsPerCycle: { type: "integer" }, cycleFrequency: { type: "string" }, distributionModel: { type: "string", enum: ["shared", "individual", "custom"] } }, required: ["planId", "name"] },
      SubscriptionCreate: { type: "object", properties: { planVersionId: { type: "string" }, holderMemberId: { type: "string" }, startDate: { type: "string", format: "date" } }, required: ["planVersionId", "holderMemberId"] },
      AccessRequest: { type: "object", properties: { method: { type: "string", enum: ["qr", "facial", "manual"] }, memberId: { type: "string" }, tokenHash: { type: "string" }, accessPointId: { type: "string" }, affiliationId: { type: "string" } }, required: ["method"] },
    },
  },
  tags: [
    { name: "Plans", description: "Plan version management" },
    { name: "Subscriptions", description: "Subscription CRUD and members" },
    { name: "Lifecycle", description: "Subscription state transitions" },
    { name: "Affiliations", description: "Member affiliation queries" },
    { name: "Sessions", description: "Session ledger operations" },
    { name: "Access", description: "Unified access authorization" },
    { name: "Biometrics", description: "Facial recognition profiles" },
    { name: "Dashboard", description: "Evolution metrics" },
    { name: "Member Portal", description: "Self-service member endpoints" },
    { name: "Operations", description: "Admin operations and workers" },
  ],
};

export function registerEvolutionApiDocs(app: Express) {
  app.get("/api-docs/evolution.json", (_req, res) => {
    res.json(EVOLUTION_OPENAPI_SPEC);
  });

  // System status endpoint for monitoring
  app.get("/api/v2/system/status", async (req, res) => {
    res.json({
      service: "powergym-evolution",
      version: "2.0.0",
      status: "healthy",
      timestamp: new Date().toISOString(),
      features: {
        subscriptionsV2: true,
        sessionLedger: true,
        unifiedAccess: true,
        biometrics: true,
        workers: true,
        memberPortal: true,
        dashboard: true,
      },
    });
  });
}
