import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { AccessRequestsClient } from "./AccessRequestsClient";

export default async function AccessRequestsPage() {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) redirect("/dashboard");

  const requests = await db
    .select()
    .from(schema.tenantAccessRequests)
    .orderBy(desc(schema.tenantAccessRequests.createdAt));

  return <AccessRequestsClient initial={requests} />;
}
