/**
 * Shared helper — verify a user has access to a lead before
 * attaching a voice note. Returns the lead row or null.
 */
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

export async function getLeadForVoiceNote(
  leadId: string,
  tenantId: string,
  userId: string,
  role: string
) {
  const conditions = [
    eq(schema.leads.id, leadId),
    eq(schema.leads.tenantId, tenantId),
  ];
  // booth_user can only access their own leads
  if (role === "booth_user") {
    conditions.push(eq(schema.leads.createdByUserId, userId));
  }
  const rows = await db
    .select({ id: schema.leads.id, eventId: schema.leads.eventId })
    .from(schema.leads)
    .where(and(...conditions))
    .limit(1);
  return rows[0] ?? null;
}
