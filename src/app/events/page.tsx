import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { isTenantAdmin } from "@/lib/permissions";
import { EventsClient } from "./EventsClient";

export default async function EventsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  const events = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.tenantId, tenantId))
    .orderBy(schema.events.startDate);

  return (
    <EventsClient
      initial={events}
      canCreate={isTenantAdmin(session.user.role)}
    />
  );
}
