import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { OpportunityDetailClient } from "./OpportunityDetailClient";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  const { id } = await params;

  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.tenantId, tenantId));

  return <OpportunityDetailClient opportunityId={id} userRole={session.user.role} userId={session.user.id!} users={users} />;
}
