import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

// PATCH /api/followups/[id] — approve or reject a draft.
// Managers and tenant_admins can approve/reject. Booth users and platform_admin cannot.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const allowedRoles = ["manager", "tenant_admin"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can approve or reject drafts" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { status?: "approved" | "rejected" };
  const { status } = body;

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(schema.followupRecommendations)
    .where(and(eq(schema.followupRecommendations.id, id), eq(schema.followupRecommendations.tenantId, tenantId)))
    .limit(1);
  if (!rows.length) return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });

  const [updated] = await db
    .update(schema.followupRecommendations)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.followupRecommendations.id, id))
    .returning();

  await logAudit({
    tenantId, userId: session.user.id,
    action: status === "approved" ? "followup_approved" : "followup_rejected",
    resourceType: "followup",
    resourceId: id,
    metadata: { leadId: updated.leadId, followupType: updated.followupType },
  });

  return NextResponse.json(updated);
}
