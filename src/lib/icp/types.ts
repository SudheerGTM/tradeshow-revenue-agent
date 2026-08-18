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
