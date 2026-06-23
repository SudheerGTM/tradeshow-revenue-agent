import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PipelineClient } from "./PipelineClient";

export default async function PipelinePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  return <PipelineClient userRole={session.user.role} />;
}
