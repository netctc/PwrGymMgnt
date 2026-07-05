import { z } from "zod";

export const isoDateTimeStringSchema = z.string().trim().min(1).max(80);

export const dashboardKpiSchema = z.object({
  totalMembers: z.number().int().nonnegative(),
  activeSubscriptions: z.number().int().nonnegative(),
  classesToday: z.number().int().nonnegative(),
  occupancyRate: z.number().min(0).max(100),
});

export const dashboardChartPointSchema = z.object({
  day: z.string().min(1).max(16),
  classes: z.number().int().nonnegative(),
});

export const dashboardPiePointSchema = z.object({
  name: z.string().min(1).max(80),
  value: z.number().nonnegative(),
});

export const dashboardSignupPointSchema = z.object({
  name: z.string().min(1).max(16),
  signups: z.number().int().nonnegative(),
  yearMonth: z.string().min(3).max(16),
});

export const dashboardHrKpiSchema = z.object({
  activeStaffCount: z.number().int().nonnegative(),
  understaffedDepts: z.number().int().nonnegative(),
  pendingContracts: z.number().int().nonnegative(),
  salaryDistribution: z.array(dashboardPiePointSchema),
});

export const dashboardSummaryResponseSchema = z.object({
  kpis: dashboardKpiSchema,
  weeklyClasses: z.array(dashboardChartPointSchema),
  membershipDistribution: z.array(dashboardPiePointSchema),
  signups: z.array(dashboardSignupPointSchema),
  hr: dashboardHrKpiSchema,
  generatedAt: isoDateTimeStringSchema,
});

export const trainerUtilizationSchema = z.object({
  id: z.string().min(1).max(255),
  name: z.string().min(1).max(180),
  totalClasses: z.number().int().nonnegative(),
  privateClasses: z.number().int().nonnegative(),
  groupClasses: z.number().int().nonnegative(),
});

export const trainerUtilizationResponseSchema = z.object({
  trainers: z.array(trainerUtilizationSchema),
  periodDays: z.number().int().positive().max(365),
  generatedAt: isoDateTimeStringSchema,
});


export const actionCenterSeveritySchema = z.enum(["critical", "warning", "info"]);

export const actionCenterModuleSchema = z.enum([
  "membership",
  "scheduling",
  "hr",
  "finance",
  "warehouse",
  "support",
  "system",
]);

export const actionCenterItemSchema = z.object({
  id: z.string().min(1).max(120),
  module: actionCenterModuleSchema,
  severity: actionCenterSeveritySchema,
  title: z.string().min(1).max(180),
  description: z.string().min(1).max(500),
  actionLabel: z.string().min(1).max(80),
  actionUrl: z.string().min(1).max(255),
  source: z.string().min(1).max(120),
  dueAt: isoDateTimeStringSchema.nullable().optional(),
  metric: z.number().nonnegative().optional(),
});

export const actionCenterSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
});

export const actionCenterResponseSchema = z.object({
  summary: actionCenterSummarySchema,
  items: z.array(actionCenterItemSchema),
  generatedAt: isoDateTimeStringSchema,
});

export const dashboardApiContracts = {
  summary: {
    method: "GET",
    path: "/api/dashboard/summary",
    response: dashboardSummaryResponseSchema,
  },
  trainerUtilization: {
    method: "GET",
    path: "/api/dashboard/trainer-utilization",
    response: trainerUtilizationResponseSchema,
  },
  actionCenter: {
    method: "GET",
    path: "/api/dashboard/action-center",
    response: actionCenterResponseSchema,
  },
} as const;

export type DashboardSummaryResponse = z.infer<typeof dashboardSummaryResponseSchema>;
export type TrainerUtilization = z.infer<typeof trainerUtilizationSchema>;
export type TrainerUtilizationResponse = z.infer<typeof trainerUtilizationResponseSchema>;

export type ActionCenterSeverity = z.infer<typeof actionCenterSeveritySchema>;
export type ActionCenterModule = z.infer<typeof actionCenterModuleSchema>;
export type ActionCenterItem = z.infer<typeof actionCenterItemSchema>;
export type ActionCenterResponse = z.infer<typeof actionCenterResponseSchema>;
