import type { IcpProfile, IcpStatus } from "@/db/schema";
import type { ICPConfig } from "./schema";

/**
 * Resolved ICP context handed to a consumer (Lead Scoring, Follow-Up,
 * Conversation Intelligence, CompanyIntelTab, etc.). `null` from any resolver
 * function means "no ICP configured for this tenant/event" — every consumer
 * must treat that as "fall back to today's default behavior," never as an
 * error. See docs/RELEASE-14-CONFIGURABLE-ICP.md § D/E.
 */
export interface ICPContext {
  profileId: string;
  tenantId: string;
  name: string;
  status: IcpStatus;
  version: number;
  config: ICPConfig;
}

export function toICPContext(profile: IcpProfile, config: ICPConfig): ICPContext {
  return {
    profileId: profile.id,
    tenantId: profile.tenantId,
    name: profile.name,
    status: profile.status,
    version: profile.version,
    config,
  };
}

/**
 * Release 14.4 — unified targeting result. `icps` is always evaluated
 * independently by a caller (OR semantics — one evaluateICPFitQualitative()
 * call per entry, never merged into one combined config). See
 * resolveTargetingContext() in icp-resolver.ts for how `source`/`contextId`
 * are chosen: Event ICPs > Campaign ICPs > Tenant Default ICP > null.
 */
export type TargetingSource = "event" | "campaign" | "tenant_default";

export interface TargetingContext {
  source: TargetingSource;
  contextId: string; // the event, campaign, or tenant id that produced this
  icps: ICPContext[]; // always non-empty when this type is returned
}
