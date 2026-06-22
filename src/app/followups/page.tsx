import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FollowUpsClient } from "./FollowUpsClient";

export default async function FollowUpsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  return <FollowUpsClient userRole={session.user.role} />;
}
