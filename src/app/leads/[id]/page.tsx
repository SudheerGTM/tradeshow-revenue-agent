import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { LeadDetailClient } from "./LeadDetailClient";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const tenantId = session.user.tenantId!;

  const conditions = [
    eq(schema.leads.id, id),
    eq(schema.leads.tenantId, tenantId),
  ];

  if (session.user.role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, session.user.id!));
  }

  const rows = await db.select().from(schema.leads).where(and(...conditions)).limit(1);
  if (!rows.length) notFound();

  const lead = rows[0];

  // Fetch event name
  let eventName: string | undefined;
  if (lead.eventId) {
    const evRows = await db
      .select({ name: schema.events.name })
      .from(schema.events)
      .where(eq(schema.events.id, lead.eventId))
      .limit(1);
    eventName = evRows[0]?.name;
  }

  // Fetch creator name
  let creatorName: string | undefined;
  if (lead.createdByUserId) {
    const userRows = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, lead.createdByUserId))
      .limit(1);
    creatorName = userRows[0]?.name;
  }

  // Fetch most recent completed transcript for this lead (for CI source option)
  const transcriptRows = await db
    .select({ id: schema.transcripts.id })
    .from(schema.transcripts)
    .where(
      and(
        eq(schema.transcripts.leadId, id),
        eq(schema.transcripts.tenantId, tenantId),
        eq(schema.transcripts.transcribeStatus, "completed")
      )
    )
    .orderBy(desc(schema.transcripts.createdAt))
    .limit(1);
  const availableTranscriptId = transcriptRows[0]?.id ?? null;

  // Fetch audit history
  const history = await db
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      metadata: schema.auditLogs.metadata,
      createdAt: schema.auditLogs.createdAt,
      userId: schema.auditLogs.userId,
    })
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.resourceType, "lead"),
        eq(schema.auditLogs.resourceId, id)
      )
    )
    .orderBy(schema.auditLogs.createdAt);

  const historyForClient = history.map((h) => ({
    ...h,
    createdAt: h.createdAt.toISOString(),
    metadata: h.metadata as Record<string, unknown> | null,
  }));

  return (
    <LeadDetailClient
      lead={lead}
      history={historyForClient}
      eventName={eventName}
      creatorName={creatorName}
      availableTranscriptId={availableTranscriptId}
    />
  );
}
