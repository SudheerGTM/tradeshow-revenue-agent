import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ADMIN_ROLES } from "@/lib/permissions";
import type { UserRole } from "@/db/schema";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  if (!ADMIN_ROLES.includes(session.user.role as UserRole)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
