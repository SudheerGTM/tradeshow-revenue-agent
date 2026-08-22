import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTenantAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getEventICPProfiles, setEventICPProfiles, validateEventCampaignAssignment, ICPTenantMismatchError } from "@/lib/icp/icp-resolver";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

// GET /api/events/:id — tenant-scoped, any authenticated tenant role.
// Includes the event's currently-assigned ICP profile IDs (event_icp_profiles)
// since that list doesn't live on the event row itself — needed by the Edit
// Event form to pre-fill the multi-select checklist.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const [event] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.id, id), eq(schema.events.tenantId, tenantId)))
    .limit(1);

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const icpProfiles = await getEventICPProfiles(tenantId, id);

  return NextResponse.json({ ...event, icpProfileIds: icpProfiles.map((p) => p.id) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId!;
  const body = await req.json();

  const existing = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.id, id), eq(schema.events.tenantId, tenantId)))
    .limit(1);

  if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ICP and Campaign assignment are handled explicitly (validated against
  // tenant ownership) rather than passed through with the rest of the body —
  // never trust client-supplied IDs directly. Release 14.4: `icpProfileIds`
  // (plural) is current; a legacy singular `icpProfileId` is still accepted
  // for compatibility.
  const { icpProfileId, icpProfileIds, campaignId, ...rest } = body as {
    icpProfileId?: string | null; icpProfileIds?: string[]; campaignId?: string | null; [k: string]: unknown;
  };
  const icpFieldProvided = icpProfileIds !== undefined || icpProfileId !== undefined;
  let icpAssignmentChanged = false;

  if (icpFieldProvided) {
    const targetIcpIds = icpProfileIds ?? (icpProfileId ? [icpProfileId] : []);
    const currentProfiles = await getEventICPProfiles(tenantId, id);
    const currentIds = new Set(currentProfiles.map((p) => p.id));
    const targetIds = new Set(targetIcpIds);
    icpAssignmentChanged = currentIds.size !== targetIds.size || [...targetIds].some((tid) => !currentIds.has(tid));

    if (icpAssignmentChanged) {
      try {
        await setEventICPProfiles(tenantId, id, targetIcpIds);
      } catch (err) {
        if (err instanceof ICPTenantMismatchError) {
          return NextResponse.json({ error: err.message }, { status: 403 });
        }
        throw err;
      }
    }
  }

  if (campaignId !== undefined) {
    try {
      await validateEventCampaignAssignment(tenantId, campaignId);
    } catch (err) {
      if (err instanceof ICPTenantMismatchError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  const [updated] = await db
    .update(schema.events)
    .set({ ...rest, ...(campaignId !== undefined ? { campaignId } : {}), updatedAt: new Date() })
    .where(eq(schema.events.id, id))
    .returning();

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "event.updated",
    resourceType: "event",
    resourceId: id,
    metadata: body,
  });

  if (icpAssignmentChanged) {
    const newProfiles = await getEventICPProfiles(tenantId, id);
    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "event_icp_assigned",
      resourceType: "event",
      resourceId: id,
      metadata: { icpProfileIds: newProfiles.map((p) => p.id) },
    });
  }

  return NextResponse.json(updated);
}
