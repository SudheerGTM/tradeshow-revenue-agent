import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { OpportunitiesClient } from "./OpportunitiesClient";

export default async function OpportunitiesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  const events = await db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId)).orderBy(schema.events.name);
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.tenantId, tenantId));

  return <OpportunitiesClient userRole={session.user.role} events={events} users={users} />;
}
