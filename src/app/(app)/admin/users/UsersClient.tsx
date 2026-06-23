"use client";

import { useState } from "react";
import { UserPlus, Users, RefreshCw, Target, Star, Briefcase, TrendingUp, UserCheck } from "lucide-react";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { RoleBadge } from "@/components/admin/RoleBadge";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { UserDrawer, type UserDrawerActivity } from "@/components/admin/UserDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { mockLastActive } from "@/lib/mockActivity";
import type { Tenant, UserRole, Event } from "@/db/schema";

interface UserRow {
  id: string; name: string; email: string;
  role: string; status: string;
  tenantId: string | null; createdAt: Date;
}

interface UserPerf {
  leadsCaptured: number; qualifiedLeads: number; opportunitiesCreated: number; pipelineGenerated: number;
}

interface TenantKpis {
  totalUsers: number; activeUsers: number; leadsCaptured: number; qualifiedLeads: number; opportunities: number; pipelineValue: number;
}

interface Props {
  initial: UserRow[];
  tenants: Tenant[];
  events: Event[];
  userPerf: Record<string, UserPerf>;
  userActivity: Record<string, UserDrawerActivity[]>;
  tenantKpis: TenantKpis;
  actorRole: string;
  actorTenantId?: string;
}

function fmtGBP(n: number) { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

export function UsersClient({ initial, tenants, events, userPerf, userActivity, tenantKpis, actorRole, actorTenantId }: Props) {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [showInvite, setShowInvite] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  const drawerUser = users.find((u) => u.id === drawerUserId) ?? null;
  const drawerPerf = drawerUserId ? (userPerf[drawerUserId] ?? { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 }) : { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 };
  const drawerActivity = drawerUserId ? (userActivity[drawerUserId] ?? []) : [];

  const canCreate = actorRole === "platform_admin" || actorRole === "tenant_admin";

  async function handleToggle(user: UserRow) {
    setTogglingId(user.id);
    const newStatus = user.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated: UserRow = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`${updated.name} ${newStatus === "active" ? "activated" : "deactivated"}`);
    } else {
      toast.error("Failed to update user status");
    }
    setTogglingId(null);
  }

  function onCreated(user: UserRow) {
    setUsers((prev) => [user, ...prev]);
    setShowInvite(false);
    toast.success(`${user.name} added to the team`);
  }

  const kpis = [
    { icon: Users, label: "Total Users", value: String(tenantKpis.totalUsers), color: "#0F4C81", bg: "#dbeafe" },
    { icon: UserCheck, label: "Active Users", value: String(tenantKpis.activeUsers), color: "#16A34A", bg: "#dcfce7" },
    { icon: Target, label: "Leads Captured", value: String(tenantKpis.leadsCaptured), color: "#00B8D9", bg: "#e6f8fc" },
    { icon: Star, label: "Qualified Leads", value: String(tenantKpis.qualifiedLeads), color: "#d97706", bg: "#fef3c7" },
    { icon: Briefcase, label: "Opportunities", value: String(tenantKpis.opportunities), color: "#0F4C81", bg: "#dbeafe" },
    { icon: TrendingUp, label: "Pipeline Value", value: fmtGBP(tenantKpis.pipelineValue), color: "#16A34A", bg: "#dcfce7" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage team members across your tenant"
        action={
          canCreate ? (
            <Button onClick={() => setShowInvite(true)}>
              <UserPlus className="w-4 h-4" /> Invite User
            </Button>
          ) : null
        }
      />

      {/* Team Performance */}
      <div>
        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Team Performance</p>
        <KpiGrid items={kpis} />
      </div>

      {users.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
          <EmptyState icon={Users} title="No users yet" description="Invite the first member of this tenant." />
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-[#F1F5F9]">
            {users.map((u) => {
              const perf = userPerf[u.id] ?? { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 };
              return (
                <button key={u.id} onClick={() => setDrawerUserId(u.id)} className="w-full text-left p-4 space-y-3 active:bg-[#F8FAFC]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[#0F172A] truncate">{u.name}</p>
                      <p className="text-xs text-[#94A3B8] truncate">{u.email}</p>
                    </div>
                    <Badge variant={statusBadge(u.status)} className="shrink-0">{u.status}</Badge>
                  </div>
                  <RoleBadge role={u.role} />
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#475569]">
                    <span>Leads: <span className="font-semibold text-[#0F172A]">{perf.leadsCaptured}</span></span>
                    <span>Opportunities: <span className="font-semibold text-[#0F172A]">{perf.opportunitiesCreated}</span></span>
                    <span>Pipeline: <span className="font-semibold text-[#16A34A]">{fmtGBP(perf.pipelineGenerated)}</span></span>
                    <span>Last Active: {mockLastActive(u.id)}</span>
                  </div>
                  {canCreate && (
                    <span
                      onClick={(e) => { e.stopPropagation(); handleToggle(u); }}
                      className="inline-flex items-center gap-1.5 text-xs text-[#00B8D9] font-medium min-h-[36px]"
                    >
                      {togglingId === u.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {u.status === "active" ? "Deactivate" : "Activate"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tablet/Desktop: table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs text-[#94A3B8] uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Last Active</th>
                <th className="px-5 py-3 font-medium">Leads</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Opportunities</th>
                <th className="px-5 py-3 font-medium">Pipeline Value</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {users.map((u) => {
                const perf = userPerf[u.id] ?? { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 };
                return (
                  <tr key={u.id} className="hover:bg-[#F8FAFC] transition cursor-pointer" onClick={() => setDrawerUserId(u.id)}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-[#0F172A]">{u.name}</p>
                      <p className="text-xs text-[#94A3B8]">{u.email}</p>
                    </td>
                    <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                    <td className="px-5 py-3.5"><Badge variant={statusBadge(u.status)}>{u.status}</Badge></td>
                    <td className="px-5 py-3.5 text-[#475569] text-xs hidden lg:table-cell">{mockLastActive(u.id)}</td>
                    <td className="px-5 py-3.5 text-[#0F172A] font-medium">{perf.leadsCaptured}</td>
                    <td className="px-5 py-3.5 text-[#0F172A] font-medium hidden lg:table-cell">{perf.opportunitiesCreated}</td>
                    <td className="px-5 py-3.5 text-[#16A34A] font-semibold">{fmtGBP(perf.pipelineGenerated)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {canCreate && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggle(u); }}
                          disabled={togglingId === u.id}
                          className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#0F172A] transition disabled:opacity-40 ml-auto"
                        >
                          {togglingId === u.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                          {u.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserDrawer
        open={!!drawerUserId}
        onClose={() => setDrawerUserId(null)}
        user={drawerUser}
        perf={drawerPerf}
        recentActivity={drawerActivity}
      />

      {canCreate && (
        <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite User">
          <InviteUserForm
            onCreated={onCreated}
            tenants={tenants}
            events={events}
            actorRole={actorRole}
            actorTenantId={actorTenantId}
          />
        </Modal>
      )}
    </div>
  );
}


const ASSIGNABLE_ROLES: Record<string, UserRole[]> = {
  platform_admin: ["platform_admin", "tenant_admin", "manager", "booth_user"],
  tenant_admin:   ["manager", "booth_user"],
  manager:        [],
};

function InviteUserForm({
  onCreated, tenants, events, actorRole, actorTenantId,
}: {
  onCreated: (u: UserRow) => void;
  tenants: Tenant[];
  events: Event[];
  actorRole: string;
  actorTenantId?: string;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "", email: "",
    role: "booth_user" as UserRole,
    tenantId: actorTenantId ?? "",
    eventAccess: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const assignable = ASSIGNABLE_ROLES[actorRole] ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Temporary credential generated client-side — no email-sending workflow
    // exists yet, so the account is created immediately and the temporary
    // password must be shared with the invitee manually for now.
    const tempPassword = `Welcome${Math.random().toString(36).slice(2, 8)}!`;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, password: tempPassword, role: form.role, tenantId: form.tenantId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      return;
    }
    const user = await res.json();
    toast.info(`Temporary password: ${tempPassword} — share this with ${form.name} directly until email invites are available.`);
    onCreated(user);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Full name" value={form.name}
        onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="Jane Doe" />
      <Field label="Email" type="email" value={form.email}
        onChange={(v) => setForm((p) => ({ ...p, email: v }))} placeholder="jane@company.com" />

      <div>
        <label className="block text-xs font-medium text-[#475569] mb-1.5">Role</label>
        <select
          value={form.role}
          onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}
          className="w-full bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition min-h-[44px]"
        >
          {assignable.map((r) => (
            <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#475569] mb-1.5">Event Access</label>
        <select
          value={form.eventAccess}
          onChange={(e) => setForm((p) => ({ ...p, eventAccess: e.target.value }))}
          className="w-full bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition min-h-[44px]"
        >
          <option value="">All events (default)</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
        <p className="text-[11px] text-[#94A3B8] mt-1">Per-event access scoping is not enforced yet — coming in a future release.</p>
      </div>

      {actorRole === "platform_admin" && (
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1.5">Tenant</label>
          <select
            value={form.tenantId}
            onChange={(e) => setForm((p) => ({ ...p, tenantId: e.target.value }))}
            className="w-full bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition min-h-[44px]"
          >
            <option value="">— select tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">Send Invite</Button>
    </form>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#475569] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition min-h-[44px]"
      />
    </div>
  );
}
