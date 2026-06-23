import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkflowsClient } from "./WorkflowsClient";

export default async function WorkflowsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.tenantId) redirect("/dashboard");

  return <WorkflowsClient userRole={session.user.role} />;
}
