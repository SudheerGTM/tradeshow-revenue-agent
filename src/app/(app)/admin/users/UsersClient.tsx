"use client";

import { useState } from "react";
import {
  UserPlus, Users, RefreshCw, Target, Star, Briefcase, TrendingUp, UserCheck,
  Mail, Ban, Unlock as UnlockIcon, XCircle,
} from "lucide-react";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { RoleBadge } from "@/components/admin/RoleBadge";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { UserDrawer, type UserDrawerActivity } from "@/components/admin/UserDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Tenant, UserRole, Event } from "@/db/schema";

interface UserRow {
  id: string; name: string; email: string;
  role: string; status: string;
  tenantId: string | null; createdAt: Date;
  lastLoginAt: Date | null; allEvents: boolean; onboardingStep: number;
}

interface InvitationRow {
  id: string; email: string; firstName: string; lastName: string | null;
  role: string; status: string; expiresAt: Date; createdAt: Date;
}

interface UserPerf {
  leadsCaptured: number; qualifiedLeads: number; opportunitiesCreated: number; pipelineGenerated: number;
}

interface TenantKpis {
  totalUsers: number; activeUsers: number; leadsCaptured: number; qualifiedLeads: number; opportunities: number; pipelineValue: number;
}

interface Props {
  initial: UserRow[];
  invitations: InvitationRow[];
  tenants: Tenant[];
  events: Event[];
  userPerf: Record<string, UserPerf>;
  userActivity: Record<string, UserDrawerActivity[]>;
  userEventNames: Record<string, string[]>;
  tenantKpis: TenantKpis;
  actorRole: string;
  actorTenantId?: string;
}

function fmtGBP(n: number) { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

function fmtDate(d: Date | null) {
  return d ? new Date(d).toLocaleDateString() : "Never";
}

function eventAccessLabel(allEvents: boolean, names: string[]) {
  if (allEvents) return "All Events";
  if (!names.length) return "No events";
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}

const INVITATION_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", accepted: "Accepted", expired: "Expired", cancelled: "Cancelled",
};

export function UsersClient({
  initial, invitations: initialInvitations, tenants, events, userPerf, userActivity, userEventNames, tenantKpis, actorRole, actorTenantId,
}: Props) {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [invitations, setInvitations] = useState<InvitationRow[]>(initialInvitations);
  const [showInvite, setShowInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  const drawerUser = users.find((u) => u.id === drawerUserId) ?? null;
  const drawerPerf = drawerUserId ? (userPerf[drawerUserId] ?? { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 }) : { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 };
  const drawerActivity = drawerUserId ? (userActivity[drawerUserId] ?? []) : [];

  const canCreate = actorRole === "platform_admin" || actorRole === "tenant_admin";

  async function setStatus(user: UserRow, status: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusyId(user.id);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      toast.success(`${updated.name} is now ${status}`);
    } else {
      toast.error("Failed to update user status");
    }
    setBusyId(null);
  }

  async function handleUnlock(user: UserRow) {
    setBusyId(user.id);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active", unlock: true }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      toast.success(`${updated.name} unlocked`);
    } else {
      toast.error("Failed to unlock user");
    }
    setBusyId(null);
  }

  async function handleResetPassword(user: UserRow) {
    if (!confirm(`Send a password reset link to ${user.name} (${user.email})?`)) return;
    setBusyId(user.id);
    const res = await fetch(`/api/users/${user.id}/reset-password`, { method: "POST" });
    if (res.ok) {
      toast.success("Password reset email sent successfully.");
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to send password reset email");
    }
    setBusyId(null);
  }

  async function handleResendInvite(inv: InvitationRow) {
    setBusyId(inv.id);
    const res = await fetch(`/api/invitations/${inv.id}/resend`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setInvitations((prev) => prev.map((i) => (i.id === inv.id ? { ...i, ...updated } : i)));
      toast.success(`Invitation resent to ${inv.email}`);
    } else {
      toast.error("Failed to resend invitation");
    }
    setBusyId(null);
  }

  async function handleCancelInvite(inv: InvitationRow) {
    if (!confirm(`Cancel the invitation for ${inv.email}?`)) return;
    setBusyId(inv.id);
    const res = await fetch(`/api/invitations/${inv.id}/cancel`, { method: "POST" });
    if (res.ok) {
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      toast.success("Invitation cancelled");
    } else {
      toast.error("Failed to cancel invitation");
    }
    setBusyId(null);
  }

  function onInvited(inv: InvitationRow) {
    setInvitations((prev) => [inv, ...prev]);
    setShowInvite(false);
    toast.success(`Invitation sent to ${inv.email}`);
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

      {users.length === 0 && invitations.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
          <EmptyState icon={Users} title="No users yet" description="Invite the first member of this tenant." />
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-[#F1F5F9]">
            {invitations.map((inv) => (
              <div key={inv.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-[#0F172A] truncate">{[inv.firstName, inv.lastName].filter(Boolean).join(" ")}</p>
                    <p className="text-xs text-[#94A3B8] truncate">{inv.email}</p>
                  </div>
                  <Badge variant={statusBadge(inv.status === "pending" ? "invited" : inv.status)} className="shrink-0">
                    {INVITATION_STATUS_LABEL[inv.status] ?? inv.status}
                  </Badge>
                </div>
                {canCreate && (
                  <div className="flex items-center gap-4">
                    <button onClick={() => handleResendInvite(inv)} disabled={busyId === inv.id} className="text-xs text-[#00B8D9] font-medium min-h-[36px]">Resend</button>
                    <button onClick={() => handleCancelInvite(inv)} disabled={busyId === inv.id} className="text-xs text-[#DC2626] font-medium min-h-[36px]">Cancel</button>
                  </div>
                )}
              </div>
            ))}
            {users.map((u) => {
              const perf = userPerf[u.id] ?? { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 };
              const adoption = Math.round((u.onboardingStep / 5) * 100);
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
                    <span>Last Login: {fmtDate(u.lastLoginAt)}</span>
                    <span>Events: {eventAccessLabel(u.allEvents, userEventNames[u.id] ?? [])}</span>
                    <span>Adoption: {adoption}%</span>
                  </div>
                  {canCreate && (
                    <div className="flex items-center gap-3 flex-wrap">
                      {u.status === "locked" ? (
                        <span onClick={(e) => { e.stopPropagation(); handleUnlock(u); }} className="inline-flex items-center gap-1.5 text-xs text-[#16A34A] font-medium min-h-[36px]">
                          {busyId === u.id && <RefreshCw className="w-3 h-3 animate-spin" />} Unlock
                        </span>
                      ) : (
                        <span onClick={(e) => { e.stopPropagation(); setStatus(u, u.status === "active" ? "inactive" : "active"); }} className="inline-flex items-center gap-1.5 text-xs text-[#00B8D9] font-medium min-h-[36px]">
                          {busyId === u.id && <RefreshCw className="w-3 h-3 animate-spin" />} {u.status === "active" ? "Deactivate" : "Activate"}
                        </span>
                      )}
                      {u.status !== "suspended" && (
                        <span onClick={(e) => { e.stopPropagation(); setStatus(u, "suspended", `Suspend ${u.name}? They will be unable to log in.`); }} className="inline-flex items-center gap-1.5 text-xs text-[#d97706] font-medium min-h-[36px]">Suspend</span>
                      )}
                      <span onClick={(e) => { e.stopPropagation(); handleResetPassword(u); }} className="inline-flex items-center gap-1.5 text-xs text-[#475569] font-medium min-h-[36px]">Reset Password</span>
                    </div>
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
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Last Login</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Event Access</th>
                <th className="px-5 py-3 font-medium">Leads</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Adoption %</th>
                <th className="px-5 py-3 font-medium">Pipeline</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {invitations.map((inv) => (
                <tr key={inv.id} className="bg-[#F8FAFC]/40">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-[#0F172A]">{[inv.firstName, inv.lastName].filter(Boolean).join(" ")}</p>
                    <p className="text-xs text-[#94A3B8]">{inv.email}</p>
                  </td>
                  <td className="px-5 py-3.5"><RoleBadge role={inv.role} /></td>
                  <td className="px-5 py-3.5"><Badge variant={statusBadge(inv.status === "pending" ? "invited" : inv.status)}>{INVITATION_STATUS_LABEL[inv.status] ?? inv.status}</Badge></td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">Expires {fmtDate(inv.expiresAt)}</td>
                  <td className="px-5 py-3.5 hidden lg:table-cell" colSpan={1} />
                  <td className="px-5 py-3.5" colSpan={2} />
                  <td className="px-5 py-3.5" />
                  <td className="px-5 py-3.5 text-right">
                    {canCreate && (
                      <div className="flex items-center gap-3 justify-end">
                        <button onClick={() => handleResendInvite(inv)} disabled={busyId === inv.id} className="flex items-center gap-1.5 text-xs text-[#00B8D9] hover:text-[#0a8ba3] transition disabled:opacity-40">
                          <Mail className="w-3.5 h-3.5" /> Resend
                        </button>
                        <button onClick={() => handleCancelInvite(inv)} disabled={busyId === inv.id} className="flex items-center gap-1.5 text-xs text-[#DC2626] hover:text-red-700 transition disabled:opacity-40">
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.map((u) => {
                const perf = userPerf[u.id] ?? { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 };
                const adoption = Math.round((u.onboardingStep / 5) * 100);
                return (
                  <tr key={u.id} className="hover:bg-[#F8FAFC] transition cursor-pointer" onClick={() => setDrawerUserId(u.id)}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-[#0F172A]">{u.name}</p>
                      <p className="text-xs text-[#94A3B8]">{u.email}</p>
                    </td>
                    <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                    <td className="px-5 py-3.5"><Badge variant={statusBadge(u.status)}>{u.status}</Badge></td>
                    <td className="px-5 py-3.5 text-[#475569] text-xs hidden lg:table-cell">{fmtDate(u.lastLoginAt)}</td>
                    <td className="px-5 py-3.5 text-[#475569] text-xs hidden lg:table-cell">{eventAccessLabel(u.allEvents, userEventNames[u.id] ?? [])}</td>
                    <td className="px-5 py-3.5 text-[#0F172A] font-medium">{perf.leadsCaptured}</td>
                    <td className="px-5 py-3.5 text-[#0F172A] font-medium hidden lg:table-cell">{adoption}%</td>
                    <td className="px-5 py-3.5 text-[#16A34A] font-semibold">{fmtGBP(perf.pipelineGenerated)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {canCreate && (
                        <div className="flex items-center gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
                          {u.status === "locked" ? (
                            <button onClick={() => handleUnlock(u)} disabled={busyId === u.id} className="flex items-center gap-1.5 text-xs text-[#16A34A] hover:text-emerald-700 transition disabled:opacity-40">
                              {busyId === u.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UnlockIcon className="w-3.5 h-3.5" />} Unlock
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleResetPassword(u)} disabled={busyId === u.id} className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#0F172A] transition disabled:opacity-40">
                                Reset Password
                              </button>
                              {u.status !== "suspended" && (
                                <button onClick={() => setStatus(u, "suspended", `Suspend ${u.name}? They will be unable to log in.`)} disabled={busyId === u.id} className="flex items-center gap-1.5 text-xs text-[#d97706] hover:text-amber-700 transition disabled:opacity-40">
                                  <Ban className="w-3.5 h-3.5" /> Suspend
                                </button>
                              )}
                              <button onClick={() => setStatus(u, u.status === "active" ? "inactive" : "active")} disabled={busyId === u.id} className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#0F172A] transition disabled:opacity-40">
                                {busyId === u.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                {u.status === "active" ? "Deactivate" : "Activate"}
                              </button>
                            </>
                          )}
                        </div>
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
            onInvited={onInvited}
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
  onInvited, tenants, events, actorRole, actorTenantId,
}: {
  onInvited: (inv: InvitationRow) => void;
  tenants: Tenant[];
  events: Event[];
  actorRole: string;
  actorTenantId?: string;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    email: "", firstName: "", lastName: "",
    role: "booth_user" as UserRole,
    tenantId: actorTenantId ?? "",
    message: "",
  });
  const [accessMode, setAccessMode] = useState<"all" | "specific">("all");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const assignable = ASSIGNABLE_ROLES[actorRole] ?? [];

  function toggleEvent(id: string) {
    setSelectedEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName || undefined,
        role: form.role,
        tenantId: form.tenantId || undefined,
        eventAccess: accessMode === "all" ? "all" : selectedEvents,
        message: form.message || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      return;
    }
    const invitation = await res.json();
    toast.success(`Invitation email sent to ${form.email}`);
    onInvited(invitation);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={form.firstName}
          onChange={(v) => setForm((p) => ({ ...p, firstName: v }))} placeholder="Jane" />
        <Field label="Last name" value={form.lastName}
          onChange={(v) => setForm((p) => ({ ...p, lastName: v }))} placeholder="Doe" />
      </div>
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
        <div className="flex gap-3 mb-2">
          <label className="flex items-center gap-1.5 text-xs text-[#0F172A]">
            <input type="radio" checked={accessMode === "all"} onChange={() => setAccessMode("all")} /> All Events
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[#0F172A]">
            <input type="radio" checked={accessMode === "specific"} onChange={() => setAccessMode("specific")} /> Specific Events
          </label>
        </div>
        {accessMode === "specific" && (
          <div className="border border-[#E2E8F0] rounded-xl p-2 max-h-32 overflow-y-auto space-y-1">
            {events.length === 0 && <p className="text-xs text-[#94A3B8] px-1">No events yet</p>}
            {events.map((ev) => (
              <label key={ev.id} className="flex items-center gap-2 text-xs text-[#0F172A] px-1 py-0.5">
                <input type="checkbox" checked={selectedEvents.includes(ev.id)} onChange={() => toggleEvent(ev.id)} />
                {ev.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-[#475569] mb-1.5">Optional Message</label>
        <textarea
          value={form.message}
          onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          placeholder="Welcome to the team!"
          className="w-full bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition"
          rows={2}
        />
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
