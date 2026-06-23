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
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 sm:p-6 text-sm text-[#475569]">
          Platform admins manage tenants from{" "}
          <a href="/admin/tenants" className="text-[#00B8D9] hover:text-[#009ab8] hover:underline">/admin/tenants</a>.
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
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Tenant Settings"
        description="Details about your organisation on this platform"
      />

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm divide-y divide-[#F1F5F9]">
        <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#dbeafe] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-[#0F4C81]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0F172A] truncate">{tenant.name}</p>
            <Badge variant={statusBadge(tenant.status)} className="mt-1">{tenant.status}</Badge>
          </div>
        </div>

        {fields.map(({ label, value, mono }) => (
          <div key={label} className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <span className="text-sm text-[#94A3B8] shrink-0">{label}</span>
            <span className={`text-sm text-[#0F172A] text-right truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
          </div>
        ))}

        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <span className="text-sm text-[#94A3B8] shrink-0">Tenant ID</span>
          <span className="text-xs text-[#94A3B8] font-mono truncate">{tenant.id}</span>
        </div>
      </div>
    </div>
  );
}
