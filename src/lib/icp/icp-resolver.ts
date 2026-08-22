/**
 * ICP Resolver — Release 14.2
 *
 * The single place that reads icp_profiles / events.icp_profile_id. No agent
 * or UI component should query these tables directly or reimplement its own
 * ICP-matching logic — see docs/RELEASE-14-CONFIGURABLE-ICP.md § D/E for why
 * that duplication is exactly what this release exists to remove.
 *
 * Every function here is tenant-scoped: tenantId always comes from the
 * caller's session, never from client-supplied input, matching the pattern
 * enforced everywhere else in this codebase (docs/08-multi-tenant-architecture.md).
 */

import { db, schema } from "@/db";
import { and, eq, desc, inArray } from "drizzle-orm";
import type { IcpProfile, Campaign } from "@/db/schema";
import { ICPConfigSchema, type ICPConfig } from "./schema";
import { toICPContext, type ICPContext, type TargetingContext } from "./types";

export class ICPValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ICPValidationError";
  }
}

export class ICPTenantMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ICPTenantMismatchError";
  }
}

/** Throws ICPValidationError if `raw` doesn't match ICPConfigSchema. */
export function validateICPConfiguration(raw: unknown): ICPConfig {
  const result = ICPConfigSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new ICPValidationError(`Invalid ICP configuration: ${detail}`);
  }
  return result.data;
}

/** Tenant-scoped single-profile lookup. Returns null on any tenant mismatch — never leaks another tenant's profile. */
export async function getICPProfile(tenantId: string, profileId: string): Promise<IcpProfile | null> {
  const rows = await db
    .select()
    .from(schema.icpProfiles)
    .where(and(eq(schema.icpProfiles.id, profileId), eq(schema.icpProfiles.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Parses + validates a profile's stored configuration_json. */
export function getICPConfiguration(profile: IcpProfile): ICPConfig {
  return validateICPConfiguration(profile.configurationJson);
}

export function getICPVersion(profile: IcpProfile): number {
  return profile.version;
}

/**
 * Resolves the ICP context that should apply to a lead in this tenant/event.
 *
 * Resolution order (Release 14.3 — explicit Default ICP):
 *  1. The event's explicit `icpProfileId`, if set (and still resolvable —
 *     tenant-scoped lookup, so a stale/cross-tenant reference safely yields
 *     nothing here rather than another tenant's data).
 *  2. Otherwise, the tenant's explicit `defaultIcpProfileId`, if set AND
 *     that profile's status is "active" — a tenant can have several active
 *     profiles simultaneously (different events target different
 *     audiences); only the one explicitly marked as default is used as the
 *     fallback. If the designated default has been deactivated, it does not
 *     resolve (see `deactivateICPProfile()`, which also clears the default
 *     pointer when this happens, so this branch is a safety net, not the
 *     primary path).
 *  3. Otherwise, null.
 *
 * (Release 14.2's original rule — "exactly one active profile = implicit
 * default" — is superseded by this. See docs/ICP-ARCHITECTURE.md.)
 *
 * `null` is not an error — every consumer must treat it as "no ICP
 * configured, use today's default behavior" (see docs/RELEASE-14-CONFIGURABLE-ICP.md § D/E).
 */
export async function getActiveICPForEvent(tenantId: string, eventId: string | null): Promise<ICPContext | null> {
  if (eventId) {
    const [event] = await db
      .select({ icpProfileId: schema.events.icpProfileId })
      .from(schema.events)
      .where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, tenantId)))
      .limit(1);

    if (event?.icpProfileId) {
      const profile = await getICPProfile(tenantId, event.icpProfileId);
      if (profile) return toICPContext(profile, getICPConfiguration(profile));
      // Referenced profile no longer resolves for this tenant (deleted, or a
      // data bug) — fall through to the tenant default rather than throwing,
      // since a workflow step failing outright over this would be worse than
      // silently falling back to default scoring.
    }
  }

  const [tenant] = await db
    .select({ defaultIcpProfileId: schema.tenants.defaultIcpProfileId })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!tenant?.defaultIcpProfileId) return null;

  const profile = await getICPProfile(tenantId, tenant.defaultIcpProfileId);
  if (!profile || profile.status !== "active") return null;

  return toICPContext(profile, getICPConfiguration(profile));
}

/**
 * Server-side ownership check — throws ICPTenantMismatchError if
 * `icpProfileId` doesn't belong to `tenantId` (or doesn't exist at all).
 * Shared by both event assignment and tenant-default assignment, since both
 * are the same underlying question: "does this tenant own this profile?"
 * Returns the profile row so callers that need it don't have to re-fetch.
 */
export async function assertICPProfileOwnedByTenant(tenantId: string, icpProfileId: string): Promise<IcpProfile> {
  const profile = await getICPProfile(tenantId, icpProfileId);
  if (!profile) {
    throw new ICPTenantMismatchError(
      "ICP profile does not exist or does not belong to this tenant — cross-tenant assignment is not allowed."
    );
  }
  return profile;
}

/**
 * Release 14.4 — Event Multi-ICP. Tenant-scoped read of every ICP profile
 * currently assigned to an event via the event_icp_profiles join table
 * (the source of truth for event targeting going forward — see
 * resolveTargetingContext below). Returns [] if none assigned.
 */
export async function getEventICPProfiles(tenantId: string, eventId: string): Promise<IcpProfile[]> {
  const rows = await db
    .select({ profile: schema.icpProfiles })
    .from(schema.eventIcpProfiles)
    .innerJoin(schema.icpProfiles, eq(schema.eventIcpProfiles.icpProfileId, schema.icpProfiles.id))
    .where(and(eq(schema.eventIcpProfiles.eventId, eventId), eq(schema.icpProfiles.tenantId, tenantId)));
  return rows.map((r) => r.profile);
}

/**
 * Replaces an event's full set of assigned ICP profiles. Validates every ID
 * against tenant ownership before writing anything — a single cross-tenant
 * ID in the list rejects the whole call, nothing is partially applied.
 * Passing an empty array clears all assignments.
 */
export async function setEventICPProfiles(tenantId: string, eventId: string, icpProfileIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(icpProfileIds)];
  for (const id of uniqueIds) {
    await assertICPProfileOwnedByTenant(tenantId, id);
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.eventIcpProfiles).where(eq(schema.eventIcpProfiles.eventId, eventId));
    if (uniqueIds.length > 0) {
      await tx.insert(schema.eventIcpProfiles).values(uniqueIds.map((icpProfileId) => ({ eventId, icpProfileId })));
    }
  });
}

/**
 * Sets (or clears, if `icpProfileId` is null) the tenant's explicit default
 * ICP profile. Validates tenant ownership server-side — never trust a
 * client-supplied ICP ID without this check.
 */
export async function setTenantDefaultICP(tenantId: string, icpProfileId: string | null): Promise<void> {
  if (icpProfileId) {
    await assertICPProfileOwnedByTenant(tenantId, icpProfileId);
  }
  await db
    .update(schema.tenants)
    .set({ defaultIcpProfileId: icpProfileId, updatedAt: new Date() })
    .where(eq(schema.tenants.id, tenantId));
}

/**
 * Deactivates an ICP profile (status -> "inactive"). If this profile is
 * currently the tenant's default, clears the default pointer too, so
 * getActiveICPForEvent() never has to reason about a deactivated default —
 * see its resolution order above.
 */
export async function deactivateICPProfile(tenantId: string, icpProfileId: string): Promise<IcpProfile> {
  const profile = await assertICPProfileOwnedByTenant(tenantId, icpProfileId);

  const [updated] = await db
    .update(schema.icpProfiles)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(eq(schema.icpProfiles.id, icpProfileId))
    .returning();

  const [tenant] = await db
    .select({ defaultIcpProfileId: schema.tenants.defaultIcpProfileId })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (tenant?.defaultIcpProfileId === icpProfileId) {
    await db.update(schema.tenants).set({ defaultIcpProfileId: null, updatedAt: new Date() }).where(eq(schema.tenants.id, tenantId));
  }

  return updated ?? profile;
}

// ─── Campaigns (Release 14.4) ──────────────────────────────────────────────

/** Tenant-scoped single-campaign lookup. Returns null on any tenant mismatch. */
export async function getCampaign(tenantId: string, campaignId: string): Promise<Campaign | null> {
  const rows = await db
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Same shape as assertICPProfileOwnedByTenant, for the same reason — never trust a client-supplied Campaign ID without this. */
export async function assertCampaignOwnedByTenant(tenantId: string, campaignId: string): Promise<Campaign> {
  const campaign = await getCampaign(tenantId, campaignId);
  if (!campaign) {
    throw new ICPTenantMismatchError(
      "Campaign does not exist or does not belong to this tenant — cross-tenant assignment is not allowed."
    );
  }
  return campaign;
}

/** Every ICP profile currently assigned to a Campaign. Returns [] if none. */
export async function getCampaignICPProfiles(tenantId: string, campaignId: string): Promise<IcpProfile[]> {
  const rows = await db
    .select({ profile: schema.icpProfiles })
    .from(schema.campaignIcpProfiles)
    .innerJoin(schema.icpProfiles, eq(schema.campaignIcpProfiles.icpProfileId, schema.icpProfiles.id))
    .where(and(eq(schema.campaignIcpProfiles.campaignId, campaignId), eq(schema.icpProfiles.tenantId, tenantId)));
  return rows.map((r) => r.profile);
}

/** Replaces a Campaign's full set of assigned ICP profiles. Same all-or-nothing validation as setEventICPProfiles. */
export async function setCampaignICPProfiles(tenantId: string, campaignId: string, icpProfileIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(icpProfileIds)];
  for (const id of uniqueIds) {
    await assertICPProfileOwnedByTenant(tenantId, id);
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.campaignIcpProfiles).where(eq(schema.campaignIcpProfiles.campaignId, campaignId));
    if (uniqueIds.length > 0) {
      await tx.insert(schema.campaignIcpProfiles).values(uniqueIds.map((icpProfileId) => ({ campaignId, icpProfileId })));
    }
  });
}

/**
 * Server-side guard for assigning a Campaign to an event. Passing
 * `campaignId: null` (clearing) is always valid and returns without checking.
 */
export async function validateEventCampaignAssignment(tenantId: string, campaignId: string | null): Promise<void> {
  if (!campaignId) return;
  await assertCampaignOwnedByTenant(tenantId, campaignId);
}

/**
 * Release 14.4 — the single unified targeting resolver. Supersedes
 * `getActiveICPForEvent` as the entry point future agent integrations
 * should call (getActiveICPForEvent is kept, unmodified, for any existing
 * caller — there are none in production agent code today, see docs/
 * ICP-ARCHITECTURE.md "Explicitly not built yet").
 *
 * Resolution order — more specific targeting wins:
 *   1. Event ICPs (event_icp_profiles) — if the event has any, use them.
 *   2. Campaign ICPs (campaign_icp_profiles) — if the event has no ICPs of
 *      its own but belongs to a Campaign that has ICPs, use those. Campaign
 *      ICPs are a fallback for that event, not deleted or overridden.
 *   3. Tenant Default ICP — if neither of the above resolves.
 *   4. null — nothing configured.
 *
 * Every ICP in the returned array must be evaluated independently (OR
 * semantics) — this function does not merge criteria or pick a winner;
 * that's a future agent-layer concern (R14.5+), not this resolver's job.
 */
export async function resolveTargetingContext(tenantId: string, eventId: string): Promise<TargetingContext | null> {
  const [event] = await db
    .select({ id: schema.events.id, campaignId: schema.events.campaignId })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, tenantId)))
    .limit(1);

  if (event) {
    const eventIcps = await getEventICPProfiles(tenantId, event.id);
    if (eventIcps.length > 0) {
      return {
        source: "event",
        contextId: event.id,
        icps: eventIcps.map((p) => toICPContext(p, getICPConfiguration(p))),
      };
    }

    if (event.campaignId) {
      const campaignIcps = await getCampaignICPProfiles(tenantId, event.campaignId);
      if (campaignIcps.length > 0) {
        return {
          source: "campaign",
          contextId: event.campaignId,
          icps: campaignIcps.map((p) => toICPContext(p, getICPConfiguration(p))),
        };
      }
    }
  }

  const [tenant] = await db
    .select({ defaultIcpProfileId: schema.tenants.defaultIcpProfileId })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!tenant?.defaultIcpProfileId) return null;

  const defaultProfile = await getICPProfile(tenantId, tenant.defaultIcpProfileId);
  if (!defaultProfile || defaultProfile.status !== "active") return null;

  return {
    source: "tenant_default",
    contextId: tenantId,
    icps: [toICPContext(defaultProfile, getICPConfiguration(defaultProfile))],
  };
}
