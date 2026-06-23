import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CRMSyncClient } from "./CRMSyncClient";

export default async function CRMSyncPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  return <CRMSyncClient userRole={session.user.role} />;
}
