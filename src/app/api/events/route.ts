import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getAccessibleEventIds } from "@/lib/event-access";
import { setEventICPProfiles, validateEventCampaignAssignment, ICPTenantMismatchError } from "@/lib/icp/icp-resolver";
import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";

// GET /api/events — scoped to caller's tenant; pass ?accessible=true to also
// scope down to the caller's assigned events (used by the lead-capture event picker)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const accessibleOnly = new URL(req.url).searchParams.get("accessible") === "true";
  const conditions = [eq(schema.events.tenantId, tenantId)];

  if (accessibleOnly) {
    const [me] = await db
      .select({ allEvents: schema.users.allEvents })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id!))
      .limit(1);
    const accessibleEventIds = await getAccessibleEventIds(session.user.id!, me?.allEvents ?? true);
    if (accessibleEventIds !== null) {
      conditions.push(inArray(schema.events.id, accessibleEventIds.length ? accessibleEventIds : ["00000000-0000-0000-0000-000000000000"]));
    }
  }

  const rows = await db
    .select()
    .from(schema.events)
    .where(and(...conditions))
    .orderBy(schema.events.startDate);

  return NextResponse.json(rows);
}

// POST /api/events — tenant_admin only
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json();
  // Release 14.4 — an event may target multiple ICPs (OR semantics).
  // `icpProfileIds` is the current field; a legacy singular `icpProfileId`
  // is still accepted and folded into a one-item array for compatibility.
  const { name, location, startDate, endDate, icpProfileId, icpProfileIds, campaignId } = body as {
    name: string; location?: string; startDate?: string; endDate?: string;
    icpProfileId?: string | null; icpProfileIds?: string[]; campaignId?: string | null;
  };

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const targetIcpIds = icpProfileIds ?? (icpProfileId ? [icpProfileId] : []);

  // Never trust a client-supplied Campaign ID without validating tenant ownership.
  try {
    await validateEventCampaignAssignment(tenantId, campaignId ?? null);
  } catch (err) {
    if (err instanceof ICPTenantMismatchError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const [event] = await db
    .insert(schema.events)
    .values({ tenantId, name, slug, location, startDate, endDate, campaignId: campaignId ?? null })
    .returning();

  // Never trust client-supplied ICP IDs without validating tenant ownership.
  // If this fails, roll back the just-created event rather than leaving it
  // with no targeting the caller didn't ask for.
  if (targetIcpIds.length > 0) {
    try {
      await setEventICPProfiles(tenantId, event.id, targetIcpIds);
    } catch (err) {
      await db.delete(schema.events).where(eq(schema.events.id, event.id));
      if (err instanceof ICPTenantMismatchError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "event.created",
    resourceType: "event",
    resourceId: event.id,
    metadata: { name, slug },
  });

  if (targetIcpIds.length > 0) {
    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "event_icp_assigned",
      resourceType: "event",
      resourceId: event.id,
      metadata: { icpProfileIds: targetIcpIds },
    });
  }

  return NextResponse.json(event, { status: 201 });
}
