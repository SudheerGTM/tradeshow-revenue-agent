import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { businessCardImageId } = await req.json() as { businessCardImageId: string };
  if (!businessCardImageId) return NextResponse.json({ error: "businessCardImageId required" }, { status: 400 });

  const rows = await db
    .select({ id: schema.businessCardImages.id, leadId: schema.businessCardImages.leadId })
    .from(schema.businessCardImages)
    .where(
      and(
        eq(schema.businessCardImages.id, businessCardImageId),
        eq(schema.businessCardImages.tenantId, tenantId),
        eq(schema.businessCardImages.uploadStatus, "pending_upload")
      )
    )
    .limit(1);

  if (!rows.length) {
    return NextResponse.json({ error: "Business card image not found or already completed" }, { status: 404 });
  }

  await db
    .update(schema.businessCardImages)
    .set({ uploadStatus: "uploaded", updatedAt: new Date() })
    .where(eq(schema.businessCardImages.id, businessCardImageId));

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "business_card_uploaded",
    resourceType: "business_card_image",
    resourceId: businessCardImageId,
    metadata: { leadId: rows[0].leadId },
  });

  return NextResponse.json({ success: true });
}
