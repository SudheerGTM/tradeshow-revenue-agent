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

  const { voiceNoteId } = await req.json() as { voiceNoteId: string };
  if (!voiceNoteId) return NextResponse.json({ error: "voiceNoteId required" }, { status: 400 });

  const rows = await db
    .select()
    .from(schema.voiceNotes)
    .where(
      and(
        eq(schema.voiceNotes.id, voiceNoteId),
        eq(schema.voiceNotes.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const note = rows[0];

  // Booth users can only delete their own notes
  if (session.user.role === "booth_user" && note.createdByUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only manager+ actually removes from S3; others do soft-delete only
  if (isManager(session.user.role) && note.recordingStatus === "uploaded") {
    try {
      await deleteAudioFile(note.s3Key);
    } catch {
      // Log but don't block — DB record will still be soft-deleted
    }
  }

  await db
    .update(schema.voiceNotes)
    .set({
      recordingStatus: "deleted",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.voiceNotes.id, voiceNoteId));

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "voice_note_deleted",
    resourceType: "voice_note",
    resourceId: voiceNoteId,
    metadata: { s3Key: note.s3Key, hardDelete: isManager(session.user.role) },
  });

  return NextResponse.json({ success: true });
}
