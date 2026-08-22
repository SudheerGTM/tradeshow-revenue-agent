import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { TenantsClient } from "./TenantsClient";

export default async function TenantsPage() {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) redirect("/dashboard");

  const tenants = await db
    .select({ ...getTableColumns(schema.tenants), eventCount: sql<number>`count(${schema.events.id})::int` })
    .from(schema.tenants)
    .leftJoin(schema.events, eq(schema.events.tenantId, schema.tenants.id))
    .groupBy(schema.tenants.id)
    .orderBy(schema.tenants.createdAt);

  return <TenantsClient initial={tenants} />;
}
