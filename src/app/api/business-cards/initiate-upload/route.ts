import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { buildBusinessCardS3Key, generatePresignedUploadUrl } from "@/lib/aws/s3";
import { getLeadForVoiceNote } from "@/lib/voice-notes";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json();
  const {
    leadId, fileName, fileType, fileSizeBytes,
    ocrRawText, extractedFieldsJson, cardConsentConfirmed,
  } = body as {
    leadId: string; fileName: string; fileType: string; fileSizeBytes: number;
    ocrRawText?: string; extractedFieldsJson?: string; cardConsentConfirmed?: boolean;
  };

  if (!leadId || !fileName || !fileType) {
    return NextResponse.json({ error: "leadId, fileName, fileType required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json({ error: `Unsupported file type: ${fileType}` }, { status: 400 });
  }
  if (fileSizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 400 });
  }

  // Verify caller has access to the lead (logic is generic, not audio-specific)
  const lead = await getLeadForVoiceNote(leadId, tenantId, session.user.id!, session.user.role);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const consentTimestamp = cardConsentConfirmed ? new Date() : null;

  // Create DB record first (we need the ID for the S3 key)
  const [card] = await db
    .insert(schema.businessCardImages)
    .values({
      tenantId,
      eventId: lead.eventId ?? null,
      leadId,
      createdByUserId: session.user.id ?? null,
      s3Bucket: process.env.AWS_S3_BUCKET!,
      s3Key: "pending",
      fileName,
      fileType,
      fileSizeBytes: String(fileSizeBytes),
      uploadStatus: "pending_upload",
      ocrStatus: ocrRawText ? "completed" : "not_started",
      ocrReviewStatus: "reviewed",
      ocrRawText: ocrRawText ?? null,
      extractedFieldsJson: extractedFieldsJson ?? null,
      cardConsentConfirmed: !!cardConsentConfirmed,
      cardConsentTimestamp: consentTimestamp,
      retentionDeleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days, mirrors voice notes
    })
    .returning();

  const s3Key = buildBusinessCardS3Key({
    tenantId,
    eventId: lead.eventId ?? "no-event",
    leadId,
    businessCardImageId: card.id,
    fileType,
  });

  await db
    .update(schema.businessCardImages)
    .set({ s3Key })
    .where(eq(schema.businessCardImages.id, card.id));

  const uploadUrl = await generatePresignedUploadUrl(s3Key, fileType, fileSizeBytes);

  if (cardConsentConfirmed) {
    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "consent_recorded",
      resourceType: "business_card_image",
      resourceId: card.id,
      metadata: { leadId },
    });
  }

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "business_card_upload_initiated",
    resourceType: "business_card_image",
    resourceId: card.id,
    metadata: { leadId, fileName, fileType, fileSizeBytes },
  });

  return NextResponse.json({ businessCardImageId: card.id, uploadUrl, s3Key }, { status: 201 });
}
