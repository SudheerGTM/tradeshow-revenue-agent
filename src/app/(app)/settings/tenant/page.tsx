import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTenantById } from "@/lib/tenant";
import { db, schema } from "@/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { IntegrationsStatusCard, type Integration } from "@/components/admin/IntegrationsStatusCard";
import { RecentActivityCard } from "@/components/admin/RecentActivityCard";
import { Building2, Users, CalendarDays, Target, Star, Briefcase, TrendingUp, Zap } from "lucide-react";

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
  const tenantId = session.user.tenantId;

  const tenant = await getTenantById(tenantId);
  if (!tenant) redirect("/dashboard");

  // ── Team Performance KPIs (real tenant data) ──────────────────────────────
  const [userCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.tenantId, tenantId));
  const [eventCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.events).where(eq(schema.events.tenantId, tenantId));
  const [leadCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.leads).where(eq(schema.leads.tenantId, tenantId));

  const latestScoreSq = db
    .selectDistinctOn([schema.leadScores.leadId], { leadId: schema.leadScores.leadId, classification: schema.leadScores.classification })
    .from(schema.leadScores)
    .where(eq(schema.leadScores.tenantId, tenantId))
    .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
    .as("latest_score_settings");
  const qualifiedRows = await db.select({ count: sql<number>`count(*)::int` }).from(latestScoreSq).where(sql`${latestScoreSq.classification} in ('hot', 'warm')`);
  const qualifiedLeads = qualifiedRows[0]?.count ?? 0;

  const [oppRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pipeline: sql<string>`coalesce(sum(amount), 0)`,
      expectedRevenue: sql<string>`coalesce(sum(expected_revenue), 0)`,
    })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")));

  const fmtGBP = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  const kpis = [
    { icon: Users, label: "Users", value: String(userCountRow?.count ?? 0), color: "#0F4C81", bg: "#dbeafe" },
    { icon: CalendarDays, label: "Events", value: String(eventCountRow?.count ?? 0), color: "#00B8D9", bg: "#e6f8fc" },
    { icon: Target, label: "Leads Captured", value: String(leadCountRow?.count ?? 0), color: "#0F4C81", bg: "#dbeafe" },
    { icon: Star, label: "Qualified Leads", value: String(qualifiedLeads), color: "#d97706", bg: "#fef3c7" },
    { icon: Briefcase, label: "Open Opportunities", value: String(oppRow?.count ?? 0), color: "#16A34A", bg: "#dcfce7" },
    { icon: TrendingUp, label: "Pipeline Value", value: fmtGBP(parseFloat(oppRow?.pipeline ?? "0")), color: "#0F4C81", bg: "#dbeafe" },
    { icon: Zap, label: "Expected Revenue", value: fmtGBP(parseFloat(oppRow?.expectedRevenue ?? "0")), color: "#16A34A", bg: "#dcfce7" },
  ];

  // ── Integrations status — real env-var presence checks, no API calls ─────
  const integrations: Integration[] = [
    { name: "Apollo", status: process.env.APOLLO_API_KEY ? "connected" : "disconnected", note: "Company & contact enrichment" },
    { name: "HubSpot", status: process.env.HUBSPOT_ACCESS_TOKEN ? "connected" : "needs_attention", note: "CRM sync — access token not configured" },
    { name: "Gemini", status: process.env.GEMINI_API_KEY ? "connected" : "disconnected", note: "Conversation intelligence & AI agents" },
    { name: "AWS S3", status: process.env.AWS_ACCESS_KEY_ID ? "connected" : "disconnected", note: "Voice note storage" },
    { name: "AWS Transcribe", status: "needs_attention", note: "Account not yet subscribed for Transcribe in this AWS account" },
  ];

  // ── Recent activity ───────────────────────────────────────────────────────
  const recentActivity = await db
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      createdAt: schema.auditLogs.createdAt,
      userName: schema.users.name,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .where(eq(schema.auditLogs.tenantId, tenantId))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(10);

  const activityRows = recentActivity.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));

  const fields = [
    { label: "Name",      value: tenant.name },
    { label: "Slug",      value: tenant.slug,      mono: true },
    { label: "Subdomain", value: tenant.subdomain,  mono: true },
    { label: "Event",     value: tenant.eventName ?? "—" },
    { label: "Created",   value: new Date(tenant.createdAt).toLocaleString() },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Tenant Settings"
        description="Details about your organisation on this platform"
      />

      {/* Team Performance */}
      <div>
        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Team Performance</p>
        <KpiGrid items={kpis} />
      </div>

      {/* Integrations + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <IntegrationsStatusCard integrations={integrations} />
        <RecentActivityCard rows={activityRows} />
      </div>

      {/* Tenant details */}
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
