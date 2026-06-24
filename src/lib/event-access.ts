import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/** Returns null when the user has unrestricted access ("all events"), otherwise the accessible event ids. */
export async function getAccessibleEventIds(userId: string, allEvents: boolean): Promise<string[] | null> {
  if (allEvents) return null;
  const rows = await db
    .select({ eventId: schema.userEventAccess.eventId })
    .from(schema.userEventAccess)
    .where(eq(schema.userEventAccess.userId, userId));
  return rows.map((r) => r.eventId);
}

export async function setEventAccess(
  userId: string,
  allEvents: boolean,
  eventIds: string[]
): Promise<void> {
  await db.update(schema.users).set({ allEvents, updatedAt: new Date() }).where(eq(schema.users.id, userId));
  await db.delete(schema.userEventAccess).where(eq(schema.userEventAccess.userId, userId));
  if (!allEvents && eventIds.length) {
    await db.insert(schema.userEventAccess).values(eventIds.map((eventId) => ({ userId, eventId })));
  }
}
