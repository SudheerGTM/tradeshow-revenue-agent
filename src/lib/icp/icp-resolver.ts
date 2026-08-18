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
 * Resolution order:
 *  1. The event's explicit `icpProfileId`, if set (and still resolvable —
 *     tenant-scoped lookup, so a stale/cross-tenant reference safely yields
 *     nothing here rather than another tenant's data).
 *  2. Otherwise, the tenant's implicit default: exactly one profile with
 *     status "active". If the tenant has zero or more than one active
 *     profile, there is no unambiguous default — returns null rather than
 *     guessing. (No explicit "default" flag exists in the R14.2 schema by
 *     design — see docs/RELEASE-14-CONFIGURABLE-ICP.md's open questions.
 *     An explicit default-selection mechanism is expected to land with the
 *     ICP Admin UI, not before.)
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

  const activeProfiles = await db
    .select()
    .from(schema.icpProfiles)
    .where(and(eq(schema.icpProfiles.tenantId, tenantId), eq(schema.icpProfiles.status, "active")))
    .orderBy(desc(schema.icpProfiles.updatedAt));

  if (activeProfiles.length !== 1) return null;

  const [profile] = activeProfiles;
  return toICPContext(profile, getICPConfiguration(profile));
}

/**
 * Server-side guard for assigning an ICP profile to an event. Throws
 * ICPTenantMismatchError if the profile doesn't belong to the same tenant as
 * the event (or doesn't exist at all) — callers should invoke this before
 * persisting `events.icpProfileId`. Passing `icpProfileId: null` (clearing
 * the assignment) is always valid and returns without checking anything.
 */
export async function validateEventICPAssignment(tenantId: string, icpProfileId: string | null): Promise<void> {
  if (!icpProfileId) return;
  const profile = await getICPProfile(tenantId, icpProfileId);
  if (!profile) {
    throw new ICPTenantMismatchError(
      "ICP profile does not exist or does not belong to this tenant — cross-tenant assignment is not allowed."
    );
  }
}
