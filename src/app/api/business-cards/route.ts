import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { generatePresignedDownloadUrl } from "@/lib/aws/s3";
import { getLeadForVoiceNote } from "@/lib/voice-notes";

// GET /api/business-cards?lead_id= — returns uploaded card images with presigned view URLs
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const leadId = new URL(req.url).searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const lead = await getLeadForVoiceNote(leadId, tenantId, session.user.id!, session.user.role);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const cards = await db
    .select({
      id:                   schema.businessCardImages.id,
      fileName:              schema.businessCardImages.fileName,
      fileType:              schema.businessCardImages.fileType,
      fileSizeBytes:         schema.businessCardImages.fileSizeBytes,
      s3Key:                 schema.businessCardImages.s3Key,
      ocrStatus:             schema.businessCardImages.ocrStatus,
      ocrReviewStatus:       schema.businessCardImages.ocrReviewStatus,
      extractedFieldsJson:   schema.businessCardImages.extractedFieldsJson,
      createdAt:             schema.businessCardImages.createdAt,
      retentionDeleteAt:     schema.businessCardImages.retentionDeleteAt,
      uploadedByName:        schema.users.name,
    })
    .from(schema.businessCardImages)
    .leftJoin(schema.users, eq(schema.businessCardImages.createdByUserId, schema.users.id))
    .where(
      and(
        eq(schema.businessCardImages.leadId, leadId),
        eq(schema.businessCardImages.tenantId, tenantId),
        eq(schema.businessCardImages.uploadStatus, "uploaded"),
        isNull(schema.businessCardImages.deletedAt)
      )
    )
    .orderBy(schema.businessCardImages.createdAt);

  const cardsWithUrls = await Promise.all(
    cards.map(async (c) => ({
      ...c,
      imageUrl: await generatePresignedDownloadUrl(c.s3Key),
    }))
  );

  return NextResponse.json(cardsWithUrls);
}
