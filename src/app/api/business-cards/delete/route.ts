import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { deleteAudioFile } from "@/lib/aws/s3";
import { isManager } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { businessCardImageId } = await req.json() as { businessCardImageId: string };
  if (!businessCardImageId) return NextResponse.json({ error: "businessCardImageId required" }, { status: 400 });

  const rows = await db
    .select()
    .from(schema.businessCardImages)
    .where(
      and(
        eq(schema.businessCardImages.id, businessCardImageId),
        eq(schema.businessCardImages.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const card = rows[0];

  if (session.user.role === "booth_user" && card.createdByUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only manager+ actually removes from S3 (deleteAudioFile is generic despite the name)
  if (isManager(session.user.role) && card.uploadStatus === "uploaded") {
    try {
      await deleteAudioFile(card.s3Key);
    } catch {
      // Log but don't block — DB record will still be soft-deleted
    }
  }

  await db
    .update(schema.businessCardImages)
    .set({
      uploadStatus: "deleted",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.businessCardImages.id, businessCardImageId));

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "business_card_deleted",
    resourceType: "business_card_image",
    resourceId: businessCardImageId,
    metadata: { s3Key: card.s3Key, hardDelete: isManager(session.user.role) },
  });

  return NextResponse.json({ success: true });
}
