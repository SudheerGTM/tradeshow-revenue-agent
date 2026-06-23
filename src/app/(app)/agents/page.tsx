import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AgentsClient } from "./AgentsClient";

export default async function AgentsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.tenantId) redirect("/dashboard");

  return <AgentsClient userRole={session.user.role} />;
}
