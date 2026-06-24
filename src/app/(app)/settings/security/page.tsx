import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isTenantAdmin, isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq, and, gt, gte, inArray, sql, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { Badge, statusBadge } from "@/components/ui/Badge";
import {
  UserCheck, Mail, Ban, Lock, AlertTriangle, KeyRound, ShieldAlert,
} from "lucide-react";

export default async function SecurityDashboardPage() {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  const isPlatform = isPlatformAdmin(session.user.role);

  const userConditions = isPlatform ? [] : [eq(schema.users.tenantId, tenantId!)];

  const byStatus = await db
    .select({ status: schema.users.status, count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(userConditions.length ? and(...userConditions) : undefined)
    .groupBy(schema.users.status);

  const statusCounts: Record<string, number> = {};
  for (const r of byStatus) statusCounts[r.status] = r.count;

  const [{ failedLoginUsers }] = await db
    .select({ failedLoginUsers: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(and(...userConditions, gt(schema.users.failedLoginAttempts, 0)));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const passwordResetConditions = [
    inArray(schema.auditLogs.action, ["password_reset", "password_changed"]),
    gte(schema.auditLogs.createdAt, thirtyDaysAgo),
  ];
  if (!isPlatform && tenantId) passwordResetConditions.push(eq(schema.auditLogs.tenantId, tenantId));
  const [{ passwordResets }] = await db
    .select({ passwordResets: sql<number>`count(*)::int` })
    .from(schema.auditLogs)
    .where(and(...passwordResetConditions));

  const invitationConditions = isPlatform ? [] : [eq(schema.userInvitations.tenantId, tenantId!)];
  const recentInvitations = await db
    .select()
    .from(schema.userInvitations)
    .where(invitationConditions.length ? and(...invitationConditions) : undefined)
    .orderBy(desc(schema.userInvitations.createdAt))
    .limit(10);

  const kpis = [
    { icon: UserCheck, label: "Active Users", value: String(statusCounts.active ?? 0), color: "#16A34A", bg: "#dcfce7" },
    { icon: Mail, label: "Invited Users", value: String(statusCounts.invited ?? 0), color: "#0F4C81", bg: "#dbeafe" },
    { icon: Ban, label: "Suspended Users", value: String(statusCounts.suspended ?? 0), color: "#d97706", bg: "#fef3c7" },
    { icon: Lock, label: "Locked Users", value: String(statusCounts.locked ?? 0), color: "#DC2626", bg: "#fee2e2" },
    { icon: AlertTriangle, label: "Failed Login Attempts", value: String(failedLoginUsers), color: "#d97706", bg: "#fef3c7" },
    { icon: KeyRound, label: "Password Resets (30d)", value: String(passwordResets), color: "#00B8D9", bg: "#e6f8fc" },
  ];

  const alerts: string[] = [];
  if ((statusCounts.locked ?? 0) > 0) alerts.push(`${statusCounts.locked} account${statusCounts.locked === 1 ? "" : "s"} currently locked due to failed login attempts.`);
  const expiringSoon = recentInvitations.filter(
    (i) => i.status === "pending" && new Date(i.expiresAt).getTime() - Date.now() < 48 * 60 * 60 * 1000
  );
  if (expiringSoon.length > 0) alerts.push(`${expiringSoon.length} invitation${expiringSoon.length === 1 ? "" : "s"} expiring within 48 hours.`);
  if (failedLoginUsers > 0) alerts.push(`${failedLoginUsers} user${failedLoginUsers === 1 ? "" : "s"} with recent failed login attempts.`);

  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Monitor account security across your tenant" />

      <KpiGrid items={kpis} />

      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Security Alerts</p>
          </div>
          <ul className="space-y-1">
            {alerts.map((a, i) => (
              <li key={i} className="text-sm text-amber-700">• {a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
        <div className="px-5 py-3 border-b border-[#E2E8F0]">
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Recent Invitations</p>
        </div>
        {recentInvitations.length === 0 ? (
          <p className="text-sm text-[#94A3B8] px-5 py-6">No invitations yet.</p>
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {recentInvitations.map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[#0F172A] truncate">{[inv.firstName, inv.lastName].filter(Boolean).join(" ")}</p>
                  <p className="text-xs text-[#94A3B8] truncate">{inv.email}</p>
                </div>
                <Badge variant={statusBadge(inv.status === "pending" ? "invited" : inv.status)}>
                  {inv.status === "pending" ? "Invited" : inv.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
