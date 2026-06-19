import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isManager, isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { UsersClient } from "./UsersClient";

export default async function UsersPage() {
  const session = await auth();
  if (!session || !isManager(session.user.role)) redirect("/dashboard");

  const tenants = await db.select().from(schema.tenants).orderBy(schema.tenants.name);

  let users;
  if (isPlatformAdmin(session.user.role)) {
    users = await db.select({
      id:        schema.users.id,
      name:      schema.users.name,
      email:     schema.users.email,
      role:      schema.users.role,
      status:    schema.users.status,
      tenantId:  schema.users.tenantId,
      createdAt: schema.users.createdAt,
    }).from(schema.users).orderBy(schema.users.createdAt);
  } else {
    users = await db.select({
      id:        schema.users.id,
      name:      schema.users.name,
      email:     schema.users.email,
      role:      schema.users.role,
      status:    schema.users.status,
      tenantId:  schema.users.tenantId,
      createdAt: schema.users.createdAt,
    }).from(schema.users)
      .where(eq(schema.users.tenantId, session.user.tenantId!))
      .orderBy(schema.users.createdAt);
  }

  return (
    <UsersClient
      initial={users}
      tenants={tenants}
      actorRole={session.user.role}
      actorTenantId={session.user.tenantId}
    />
  );
}
