import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import { registerBackupRestoreRoutes } from "./backupRestore";
import { registerCompatibilityRecordRoutes } from "./compatRecordsRoutes";
import { registerDashboardRoutes } from "./dashboard";
import { registerDataIntegrityRoutes } from "./dataIntegrity";
import { registerEngagementRoutes } from "./engagement";
import { registerFinanceRoutes } from "./finance";
import { registerHrPayrollRoutes } from "./hrPayroll";
import { registerMembershipRoutes } from "./membership";
import { createApiCacheMiddleware, registerPlatformSecurityRoutes } from "./platformSecurity";
import { registerProductionReadinessRoutes } from "./productionReadiness";
import { registerReportsRoutes } from "./reports";
import { registerSchedulingRoutes } from "./scheduling";
import { registerWarehouseRoutes } from "./warehouse";
import { registerSubscriptionsV2Routes } from "./subscriptionsV2";
import { registerAccessAuthorizationRoutes } from "./accessAuthorization";
import { registerBiometricRoutes } from "./biometricProfiles";
import { registerEvolutionDashboardRoutes } from "./evolutionDashboard";
import { registerSubscriptionLifecycleRoutes } from "./subscriptionLifecycle";
import { registerMemberPortalRoutes } from "./memberPortal";
import { registerPlanManagementRoutes } from "./planManagement";

export type PoolProvider = () => Pool | null;

export type ApplicationRouteModule = {
  name: string;
  area: "domain" | "platform" | "compatibility" | "reporting";
  description: string;
  register: (app: Express, poolProvider: PoolProvider, context: ApplicationModuleContext) => void;
};

export type ApplicationModuleContext = {
  apiCache: ReturnType<typeof createApiCacheMiddleware>;
};

export const APPLICATION_ROUTE_MODULES: readonly ApplicationRouteModule[] = Object.freeze([
  {
    name: "membership",
    area: "domain",
    description: "Plans, members, subscriptions, invoices, receipts and e-card access.",
    register: (app, getPool) => registerMembershipRoutes(app, getPool),
  },
  {
    name: "plan-management",
    area: "domain",
    description: "Versioned individual and multi-user plans plus database-backed bilingual list maintenance.",
    register: (app, getPool) => registerPlanManagementRoutes(app, getPool),
  },
  {
    name: "scheduling",
    area: "domain",
    description: "Resources, class sessions, class bookings and private training sessions.",
    register: (app, getPool) => registerSchedulingRoutes(app, getPool),
  },
  {
    name: "hr-payroll",
    area: "domain",
    description: "Employees, attendance, payroll runs and payroll approval workflow.",
    register: (app, getPool) => registerHrPayrollRoutes(app, getPool),
  },
  {
    name: "finance",
    area: "domain",
    description: "Accounting transactions, approvals, budgets, rentals, loans and recurring processing.",
    register: (app, getPool) => registerFinanceRoutes(app, getPool),
  },
  {
    name: "platform-security",
    area: "platform",
    description: "Security telemetry, API cache controls and operational platform endpoints.",
    register: (app, getPool, context) => registerPlatformSecurityRoutes(app, getPool, context.apiCache),
  },
  {
    name: "production-readiness",
    area: "platform",
    description: "Production readiness summary, release posture and API-first operational evidence.",
    register: (app, getPool, context) => registerProductionReadinessRoutes(app, getPool, context.apiCache, { getModuleSummary: getApplicationModuleSummary }),
  },
  {
    name: "data-integrity",
    area: "platform",
    description: "Data integrity checks and repair workflows.",
    register: (app, getPool) => registerDataIntegrityRoutes(app, getPool),
  },
  {
    name: "backup-restore",
    area: "platform",
    description: "Backup inventory and restore workflows.",
    register: (app, getPool) => registerBackupRestoreRoutes(app, getPool),
  },
  {
    name: "engagement",
    area: "domain",
    description: "Support tickets, notifications and deployment readiness support endpoints.",
    register: (app, getPool) => registerEngagementRoutes(app, getPool),
  },
  {
    name: "warehouse-pos",
    area: "domain",
    description: "Warehouse, inventory, suppliers, purchasing, POS and warehouse reports.",
    register: (app, getPool) => registerWarehouseRoutes(app, getPool),
  },
  {
    name: "dashboard",
    area: "domain",
    description: "Typed dashboard summary and trainer utilization APIs.",
    register: (app, getPool) => registerDashboardRoutes(app, getPool),
  },
  {
    name: "reports",
    area: "reporting",
    description: "PDF and tabular reporting surfaces across operational sections.",
    register: (app, getPool) => registerReportsRoutes(app, getPool),
  },
  {
    name: "compatibility-records",
    area: "compatibility",
    description: "Deprecated Firestore-style records API retained temporarily during typed API migration.",
    register: (app, getPool) => registerCompatibilityRecordRoutes(app, getPool),
  },
  {
    name: "subscriptions-v2",
    area: "domain",
    description: "V2 subscription model: plan versions, multi-user subscriptions, affiliations, session ledger.",
    register: (app, getPool) => registerSubscriptionsV2Routes(app, getPool),
  },
  {
    name: "access-authorization",
    area: "domain",
    description: "Unified access authorization motor: QR, facial, and manual access with session consumption.",
    register: (app, getPool) => registerAccessAuthorizationRoutes(app, getPool),
  },
  {
    name: "biometric-profiles",
    area: "domain",
    description: "Biometric facial recognition: consent, enrollment, revocation, deletion scheduling.",
    register: (app, getPool) => registerBiometricRoutes(app, getPool),
  },
  {
    name: "evolution-dashboard",
    area: "domain",
    description: "Evolution system metrics dashboard: subscriptions, sessions, access trends.",
    register: (app, getPool) => registerEvolutionDashboardRoutes(app, getPool),
  },
  {
    name: "subscription-lifecycle",
    area: "domain",
    description: "Subscription state management: freeze, suspend, cancel, renew, change plan.",
    register: (app, getPool) => registerSubscriptionLifecycleRoutes(app, getPool),
  },
  {
    name: "member-portal",
    area: "domain",
    description: "Self-service member portal: affiliations, session balance, access history.",
    register: (app, getPool) => registerMemberPortalRoutes(app, getPool),
  },
]);

export function registerApplicationRouteModules(app: Express, poolProvider: PoolProvider, context: ApplicationModuleContext) {
  for (const module of APPLICATION_ROUTE_MODULES) {
    module.register(app, poolProvider, context);
  }
}

export function getApplicationModuleSummary() {
  return APPLICATION_ROUTE_MODULES.map(({ name, area, description }) => ({ name, area, description }));
}

