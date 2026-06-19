import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { TenantsClient } from "./TenantsClient";

export default async function TenantsPage() {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) redirect("/dashboard");

  const tenants = await db.select().from(schema.tenants).orderBy(schema.tenants.createdAt);

  return <TenantsClient initial={tenants} />;
}
