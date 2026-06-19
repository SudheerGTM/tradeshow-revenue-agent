import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getTenantById } from "@/lib/tenant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const tenant = session.user.tenantId
    ? await getTenantById(session.user.tenantId)
    : null;

  if (tenant && tenant.status === "inactive") {
    redirect("/login?error=tenant_inactive");
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar role={session.user.role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar user={session.user} tenantName={tenant?.name} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
