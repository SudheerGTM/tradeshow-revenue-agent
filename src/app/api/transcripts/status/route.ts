import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  getTranscriptionJobStatus,
  parseTranscriptFromS3,
} from "@/lib/aws/transcribe";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const voiceNoteId = req.nextUrl.searchParams.get("voice_note_id");
  if (!voiceNoteId) {
    return NextResponse.json({ error: "voice_note_id required" }, { status: 400 });
  }

  // 1. Fetch transcript — tenant scoped
  const txRows = await db
    .select()
    .from(schema.transcripts)
    .where(
      and(
        eq(schema.transcripts.voiceNoteId, voiceNoteId),
        eq(schema.transcripts.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!txRows.length) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }
  const tx = txRows[0];

  // 2. Booth users can only access their own voice notes
  const role = session.user.role;
  if (role === "booth_user") {
    const vn = await db
      .select({ createdByUserId: schema.voiceNotes.createdByUserId })
      .from(schema.voiceNotes)
      .where(
        and(
          eq(schema.voiceNotes.id, voiceNoteId),
          eq(schema.voiceNotes.tenantId, tenantId),
          isNull(schema.voiceNotes.deletedAt)
        )
      )
      .limit(1);
    if (!vn.length || vn[0].createdByUserId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // 3. If already terminal, return cached result
  if (tx.transcribeStatus === "completed" || tx.transcribeStatus === "failed") {
    return NextResponse.json(tx);
  }

  // 4. Poll Amazon Transcribe
  let jobResult;
  try {
    jobResult = await getTranscriptionJobStatus(tx.transcribeJobName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AWS error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "transcription_status_checked",
    resourceType: "transcript",
    resourceId: tx.id,
    metadata: { status: jobResult.status },
  });

  // 5. Handle completion
  if (jobResult.status === "completed" && tx.transcriptJsonS3Key) {
    let parsed;
    try {
      parsed = await parseTranscriptFromS3(tx.transcriptJsonS3Key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read transcript";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const [updated] = await db
      .update(schema.transcripts)
      .set({
        transcribeStatus: "completed",
        transcriptText: parsed.text,
        confidenceScore: parsed.confidence,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.transcripts.id, tx.id))
      .returning();

    await db
      .update(schema.voiceNotes)
      .set({ transcriptionStatus: "completed", updatedAt: new Date() })
      .where(eq(schema.voiceNotes.id, voiceNoteId));

    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "transcription_completed",
      resourceType: "transcript",
      resourceId: tx.id,
      metadata: { confidence: parsed.confidence },
    });

    return NextResponse.json(updated);
  }

  // 6. Handle failure
  if (jobResult.status === "failed") {
    const [updated] = await db
      .update(schema.transcripts)
      .set({
        transcribeStatus: "failed",
        failureReason: jobResult.failureReason ?? "Unknown",
        updatedAt: new Date(),
      })
      .where(eq(schema.transcripts.id, tx.id))
      .returning();

    await db
      .update(schema.voiceNotes)
      .set({ transcriptionStatus: "failed", updatedAt: new Date() })
      .where(eq(schema.voiceNotes.id, voiceNoteId));

    await logAudit({
      tenantId,
      userId: session.user.id,
      action: "transcription_failed",
      resourceType: "transcript",
      resourceId: tx.id,
      metadata: { reason: jobResult.failureReason },
    });

    return NextResponse.json(updated);
  }

  // 7. Still in progress — update status and return
  const [updated] = await db
    .update(schema.transcripts)
    .set({ transcribeStatus: jobResult.status, updatedAt: new Date() })
    .where(eq(schema.transcripts.id, tx.id))
    .returning();

  return NextResponse.json(updated);
}
