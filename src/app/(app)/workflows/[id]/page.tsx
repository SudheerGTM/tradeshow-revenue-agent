import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkflowDetailClient } from "./WorkflowDetailClient";

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.tenantId) redirect("/dashboard");

  const { id } = await params;

  return <WorkflowDetailClient workflowId={id} userRole={session.user.role} />;
}
