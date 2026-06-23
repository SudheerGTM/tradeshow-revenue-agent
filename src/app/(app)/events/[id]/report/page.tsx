import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { EventReportClient } from "./EventReportClient";

export default async function EventReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  const { id } = await params;
  const eventRows = await db.select().from(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.tenantId, tenantId))).limit(1);
  if (!eventRows.length) notFound();

  return <EventReportClient eventId={id} userRole={session.user.role} />;
}
