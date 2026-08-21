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
import { and, eq, desc } from "drizzle-orm";
import type { IcpProfile } from "@/db/schema";
import { ICPConfigSchema, type ICPConfig } from "./schema";
import { toICPContext, type ICPContext } from "./types";

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
 * Server-side guard for assigning an ICP profile to an event. Passing
 * `icpProfileId: null` (clearing the assignment) is always valid and
 * returns without checking anything.
 */
export async function validateEventICPAssignment(tenantId: string, icpProfileId: string | null): Promise<void> {
  if (!icpProfileId) return;
  await assertICPProfileOwnedByTenant(tenantId, icpProfileId);
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
