import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  generateTranscribeJobName,
  buildTranscriptOutputKey,
  startTranscriptionJob,
} from "@/lib/aws/transcribe";

const MAX_DURATION_SECONDS = 120; // mirror the 2-min recording cap

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { voiceNoteId } = (await req.json()) as { voiceNoteId: string };
  if (!voiceNoteId) return NextResponse.json({ error: "voiceNoteId required" }, { status: 400 });

  // 1. Fetch voice note — enforce tenant isolation
  const vnRows = await db
    .select()
    .from(schema.voiceNotes)
    .where(
      and(
        eq(schema.voiceNotes.id, voiceNoteId),
        eq(schema.voiceNotes.tenantId, tenantId),
        isNull(schema.voiceNotes.deletedAt)
      )
    )
    .limit(1);

  if (!vnRows.length) {
    return NextResponse.json({ error: "Voice note not found" }, { status: 404 });
  }
  const voiceNote = vnRows[0];

  // 2. Must be uploaded
  if (voiceNote.recordingStatus !== "uploaded") {
    return NextResponse.json(
      { error: "Voice note must be fully uploaded before transcription" },
      { status: 400 }
    );
  }

  // 3. Booth users can only transcribe their own leads' notes
  const role = session.user.role;
  if (role === "booth_user" && voiceNote.createdByUserId !== session.user.id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // 4. Prevent duplicate jobs — one transcript per voice note
  const existingTx = await db
    .select({ id: schema.transcripts.id, status: schema.transcripts.transcribeStatus })
    .from(schema.transcripts)
    .where(
      and(
        eq(schema.transcripts.voiceNoteId, voiceNoteId),
        eq(schema.transcripts.tenantId, tenantId)
      )
    )
    .limit(1);

  if (existingTx.length) {
    const s = existingTx[0].status;
    if (s === "queued" || s === "in_progress" || s === "completed") {
      return NextResponse.json(
        { error: `Transcription already ${s} for this voice note` },
        { status: 409 }
      );
    }
    // If previous attempt failed, delete it and allow retry
    await db
      .delete(schema.transcripts)
      .where(eq(schema.transcripts.id, existingTx[0].id));
  }

  // 5. Duration guardrail
  const duration = voiceNote.durationSeconds ? Number(voiceNote.durationSeconds) : 0;
  if (duration > MAX_DURATION_SECONDS) {
    return NextResponse.json(
      { error: `Recording exceeds the ${MAX_DURATION_SECONDS}s transcription limit` },
      { status: 400 }
    );
  }

  // 6. Build job name + output S3 key
  const jobName = generateTranscribeJobName(tenantId, voiceNoteId);
  const eventId = voiceNote.eventId ?? "no-event";
  const outputS3Key = buildTranscriptOutputKey({
    tenantId,
    eventId,
    leadId: voiceNote.leadId,
    voiceNoteId,
  });

  // 7. Insert transcript record
  const [transcript] = await db
    .insert(schema.transcripts)
    .values({
      tenantId,
      eventId: voiceNote.eventId ?? null,
      leadId: voiceNote.leadId,
      voiceNoteId,
      createdByUserId: session.user.id ?? null,
      transcribeJobName: jobName,
      transcribeStatus: "queued",
      transcriptJsonS3Key: outputS3Key,
      languageCode: process.env.AWS_TRANSCRIBE_LANGUAGE_CODE ?? "en-GB",
      startedAt: new Date(),
    })
    .returning();

  // 8. Start Amazon Transcribe job
  try {
    await startTranscriptionJob({
      jobName,
      audioS3Bucket: voiceNote.s3Bucket,
      audioS3Key: voiceNote.s3Key,
      outputS3Key,
    });
  } catch (err) {
    // Roll back DB record if AWS call fails
    await db.delete(schema.transcripts).where(eq(schema.transcripts.id, transcript.id));
    const msg = err instanceof Error ? err.message : "AWS Transcribe error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 9. Update voice note transcription status
  await db
    .update(schema.voiceNotes)
    .set({ transcriptionStatus: "pending", updatedAt: new Date() })
    .where(eq(schema.voiceNotes.id, voiceNoteId));

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "transcription_started",
    resourceType: "transcript",
    resourceId: transcript.id,
    metadata: { voiceNoteId, jobName },
  });

  return NextResponse.json({ transcriptId: transcript.id, jobName }, { status: 201 });
}
