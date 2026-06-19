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

  const { voiceNoteId } = await req.json() as { voiceNoteId: string };
  if (!voiceNoteId) return NextResponse.json({ error: "voiceNoteId required" }, { status: 400 });

  // Verify ownership — must belong to this tenant
  const rows = await db
    .select({ id: schema.voiceNotes.id, leadId: schema.voiceNotes.leadId })
    .from(schema.voiceNotes)
    .where(
      and(
        eq(schema.voiceNotes.id, voiceNoteId),
        eq(schema.voiceNotes.tenantId, tenantId),
        eq(schema.voiceNotes.recordingStatus, "pending_upload")
      )
    )
    .limit(1);

  if (!rows.length) {
    return NextResponse.json({ error: "Voice note not found or already completed" }, { status: 404 });
  }

  await db
    .update(schema.voiceNotes)
    .set({
      recordingStatus: "uploaded",
      transcriptionStatus: "not_started",
      updatedAt: new Date(),
    })
    .where(eq(schema.voiceNotes.id, voiceNoteId));

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "voice_note_uploaded",
    resourceType: "voice_note",
    resourceId: voiceNoteId,
    metadata: { leadId: rows[0].leadId },
  });

  return NextResponse.json({ success: true });
}
