import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { isManager } from "@/lib/permissions";
import { EventCostsClient } from "./EventCostsClient";

export default async function EventCostsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  const { id } = await params;
  const eventRows = await db.select().from(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.tenantId, tenantId))).limit(1);
  if (!eventRows.length) notFound();

  return <EventCostsClient eventId={id} eventName={eventRows[0].name} canEdit={isManager(session.user.role)} />;
}
