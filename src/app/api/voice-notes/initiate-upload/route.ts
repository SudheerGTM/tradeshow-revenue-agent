import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { buildS3Key, generatePresignedUploadUrl } from "@/lib/aws/s3";
import { getLeadForVoiceNote } from "@/lib/voice-notes";

const ALLOWED_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB ceiling

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json();
  const { leadId, fileName, fileType, fileSizeBytes, durationSeconds } = body as {
    leadId: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
    durationSeconds?: number;
  };

  if (!leadId || !fileName || !fileType) {
    return NextResponse.json({ error: "leadId, fileName, fileType required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json({ error: `Unsupported file type: ${fileType}` }, { status: 400 });
  }
  if (fileSizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 20 MB limit" }, { status: 400 });
  }

  // Verify caller has access to the lead
  const lead = await getLeadForVoiceNote(leadId, tenantId, session.user.id!, session.user.role);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Create DB record first (we need the ID for the S3 key)
  const [voiceNote] = await db
    .insert(schema.voiceNotes)
    .values({
      tenantId,
      eventId: lead.eventId ?? null,
      leadId,
      createdByUserId: session.user.id ?? null,
      s3Bucket: process.env.AWS_S3_BUCKET!,
      s3Key: "pending",           // updated below once we have the ID
      fileName,
      fileType,
      fileSizeBytes: String(fileSizeBytes),
      durationSeconds: durationSeconds ? String(durationSeconds) : null,
      recordingStatus: "pending_upload",
      transcriptionStatus: "not_started",
      retentionDeleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
    })
    .returning();

  // Build final S3 key now that we have the voiceNote ID
  const s3Key = buildS3Key({
    tenantId,
    eventId: lead.eventId ?? "no-event",
    leadId,
    voiceNoteId: voiceNote.id,
    fileType,
  });

  // Update the record with the real key
  await db
    .update(schema.voiceNotes)
    .set({ s3Key })
    .where(eq(schema.voiceNotes.id, voiceNote.id));

  // Generate presigned upload URL (server-side only — never exposed as a permanent URL)
  const uploadUrl = await generatePresignedUploadUrl(s3Key, fileType, fileSizeBytes);

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "voice_note_upload_initiated",
    resourceType: "voice_note",
    resourceId: voiceNote.id,
    metadata: { leadId, fileName, fileType, fileSizeBytes },
  });

  return NextResponse.json({ voiceNoteId: voiceNote.id, uploadUrl, s3Key }, { status: 201 });
}
