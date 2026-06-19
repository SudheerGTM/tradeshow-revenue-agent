import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTenantById } from "@/lib/tenant";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Building2 } from "lucide-react";

export default async function TenantSettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role === "platform_admin") {
    return (
      <div className="space-y-6">
        <PageHeader title="Tenant Settings" description="Platform administrator — no tenant assigned" />
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-sm text-gray-400">
          Platform admins manage tenants from{" "}
          <a href="/admin/tenants" className="text-indigo-400 hover:underline">/admin/tenants</a>.
        </div>
      </div>
    );
  }

  if (!session.user.tenantId) redirect("/dashboard");

  const tenant = await getTenantById(session.user.tenantId);
  if (!tenant) redirect("/dashboard");

  const fields = [
    { label: "Name",      value: tenant.name },
    { label: "Slug",      value: tenant.slug,      mono: true },
    { label: "Subdomain", value: tenant.subdomain,  mono: true },
    { label: "Event",     value: tenant.eventName ?? "—" },
    { label: "Created",   value: new Date(tenant.createdAt).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenant Settings"
        description="Details about your organisation on this platform"
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        <div className="px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{tenant.name}</p>
            <Badge variant={statusBadge(tenant.status)} className="mt-1">{tenant.status}</Badge>
          </div>
        </div>

        {fields.map(({ label, value, mono }) => (
          <div key={label} className="px-6 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-400">{label}</span>
            <span className={`text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</span>
          </div>
        ))}

        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">Tenant ID</span>
          <span className="text-xs text-gray-500 font-mono">{tenant.id}</span>
        </div>
      </div>
    </div>
  );
}
