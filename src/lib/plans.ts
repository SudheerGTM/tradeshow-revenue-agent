// Release 14.3.1 — lightweight entitlement model. Deliberately not a real
// billing schema: one typed config object plus a single `tenants.plan_name`
// column (see drizzle/0018_tenant_plan.sql). Every tenant is on
// "trade_show_pro" today (its only value) since no billing backend exists —
// this exists so Plan & Usage can show real numbers against a real limit,
// not so limits are enforced. Nothing here blocks platform activity.

export type PlanName = "trade_show_pro";

export interface PlanLimits {
  label: string;
  maxUsers: number;
  monthlyLeadLimit: number;
  monthlyWorkflowLimit: number;
  enrichmentLimit: number;
  storageLimitGB: number;
  eventLimit: number;
  icpProfileLimit: number;
  campaignLimit: number;
}

export const PLANS: Record<PlanName, PlanLimits> = {
  trade_show_pro: {
    label: "Trade Show Pro",
    maxUsers: 10,
    monthlyLeadLimit: 1000,
    monthlyWorkflowLimit: 2000,
    enrichmentLimit: 500,
    storageLimitGB: 25,
    eventLimit: 10,
    icpProfileLimit: 10,
    campaignLimit: 5,
  },
};

export const DEFAULT_PLAN: PlanName = "trade_show_pro";

export function getPlan(planName: string | null | undefined): PlanLimits {
  return PLANS[(planName as PlanName) ?? DEFAULT_PLAN] ?? PLANS[DEFAULT_PLAN];
}

export type UsageState = "normal" | "approaching" | "near_limit" | "over";

export function usageState(used: number, limit: number): UsageState {
  if (limit <= 0) return "normal";
  const pct = used / limit;
  if (pct >= 1) return "over";
  if (pct >= 0.9) return "near_limit";
  if (pct >= 0.7) return "approaching";
  return "normal";
}
