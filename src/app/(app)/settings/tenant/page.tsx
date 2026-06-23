import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTenantById } from "@/lib/tenant";
import { db, schema } from "@/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { IntegrationsStatusCard, type Integration } from "@/components/admin/IntegrationsStatusCard";
import { RecentActivityCard, type ActivityRow } from "@/components/admin/RecentActivityCard";
import { CurrentEventCard, type CurrentEventData } from "@/components/admin/CurrentEventCard";
import { TenantHealthCard, type TenantHealthData } from "@/components/admin/TenantHealthCard";
import { QuickActionsPanel } from "@/components/admin/QuickActionsPanel";
import { SubscriptionPlaceholderCard } from "@/components/admin/SubscriptionPlaceholderCard";
import { Building2, Users, CalendarDays, Target, Star, Briefcase, TrendingUp, Zap } from "lucide-react";

const BUSINESS_ACTIONS = [
  "lead.created", "lead_score_generated", "lead_score_regenerated",
  "followup_generated", "followup_approved",
  "crm_sync_approved", "crm_sync_completed",
  "opportunity_created", "opportunity_stage_changed", "opportunity_amount_changed", "opportunity_won", "opportunity_lost",
];

function fmtGBP(n: number) { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

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

  // ── Team Performance KPIs ─────────────────────────────────────────────────
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

  const kpis = [
    { icon: Users, label: "Users", value: String(userCountRow?.count ?? 0), color: "#0F4C81", bg: "#dbeafe" },
    { icon: CalendarDays, label: "Events", value: String(eventCountRow?.count ?? 0), color: "#00B8D9", bg: "#e6f8fc" },
    { icon: Target, label: "Leads Captured", value: String(leadCountRow?.count ?? 0), color: "#0F4C81", bg: "#dbeafe" },
    { icon: Star, label: "Qualified Leads", value: String(qualifiedLeads), color: "#d97706", bg: "#fef3c7" },
    { icon: Briefcase, label: "Open Opportunities", value: String(oppRow?.count ?? 0), color: "#16A34A", bg: "#dcfce7" },
    { icon: TrendingUp, label: "Pipeline Value", value: fmtGBP(parseFloat(oppRow?.pipeline ?? "0")), color: "#0F4C81", bg: "#dbeafe" },
    { icon: Zap, label: "Expected Revenue", value: fmtGBP(parseFloat(oppRow?.expectedRevenue ?? "0")), color: "#16A34A", bg: "#dcfce7" },
  ];

  // ── Current Event — prefer active, else most recently scheduled/created ──
  const [activeEvent] = await db.select().from(schema.events)
    .where(and(eq(schema.events.tenantId, tenantId), eq(schema.events.status, "active")))
    .orderBy(desc(schema.events.startDate)).limit(1);
  const [fallbackEvent] = activeEvent ? [] : await db.select().from(schema.events)
    .where(eq(schema.events.tenantId, tenantId))
    .orderBy(desc(schema.events.createdAt)).limit(1);
  const currentEvent = activeEvent ?? fallbackEvent ?? null;

  let currentEventData: CurrentEventData | null = null;
  if (currentEvent) {
    const [eventLeadRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.leads).where(eq(schema.leads.eventId, currentEvent.id));

    const eventScoreSq = db
      .selectDistinctOn([schema.leadScores.leadId], { leadId: schema.leadScores.leadId, classification: schema.leadScores.classification })
      .from(schema.leadScores)
      .innerJoin(schema.leads, eq(schema.leadScores.leadId, schema.leads.id))
      .where(eq(schema.leads.eventId, currentEvent.id))
      .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
      .as("event_score_settings");
    const [eventQualifiedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(eventScoreSq).where(sql`${eventScoreSq.classification} in ('hot', 'warm')`);

    const [eventOppRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
        pipeline: sql<string>`coalesce(sum(amount), 0)`,
        expectedRevenue: sql<string>`coalesce(sum(expected_revenue), 0)`,
      })
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.eventId, currentEvent.id), eq(schema.opportunities.status, "active")));

    currentEventData = {
      id: currentEvent.id,
      name: currentEvent.name,
      status: currentEvent.status,
      leadsCaptured: eventLeadRow?.count ?? 0,
      qualifiedLeads: eventQualifiedRow?.count ?? 0,
      opportunities: eventOppRow?.count ?? 0,
      pipelineValue: parseFloat(eventOppRow?.pipeline ?? "0"),
      expectedRevenue: parseFloat(eventOppRow?.expectedRevenue ?? "0"),
    };
  }

  // ── Tenant Health ──────────────────────────────────────────────────────────
  const [activeUserRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.status, "active")));
  const totalUsers = userCountRow?.count ?? 0;
  const activeUsers = activeUserRow?.count ?? 0;
  const userActivity = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 70;

  const totalLeads = leadCountRow?.count ?? 0;
  const leadCapture = totalLeads > 0 ? Math.min(100, (qualifiedLeads / totalLeads) * 100) : 70;

  const crmSyncRows = await db.select({ status: schema.crmSyncJobs.syncStatus, count: sql<number>`count(*)::int` })
    .from(schema.crmSyncJobs).where(eq(schema.crmSyncJobs.tenantId, tenantId)).groupBy(schema.crmSyncJobs.syncStatus);
  let crmCompleted = 0, crmFailed = 0;
  for (const r of crmSyncRows) { if (r.status === "completed") crmCompleted = r.count; if (r.status === "failed") crmFailed = r.count; }
  const crmSyncHealth = (crmCompleted + crmFailed) > 0 ? (crmCompleted / (crmCompleted + crmFailed)) * 100 : 70;

  const oppStatusRows = await db.select({ status: schema.opportunities.status, count: sql<number>`count(*)::int` })
    .from(schema.opportunities).where(eq(schema.opportunities.tenantId, tenantId)).groupBy(schema.opportunities.status);
  let won = 0, lost = 0;
  for (const r of oppStatusRows) { if (r.status === "won") won = r.count; if (r.status === "lost") lost = r.count; }
  const opportunityConversion = (won + lost) > 0 ? (won / (won + lost)) * 100 : 70;

  const overall = Math.round((userActivity + leadCapture + crmSyncHealth + opportunityConversion) / 4);
  const health: TenantHealthData = { overall, userActivity, leadCapture, crmSyncHealth, opportunityConversion };

  // ── Integrations status — env presence + real last-activity timestamps ──
  const [lastEnrichment] = await db.select({ updatedAt: schema.companyEnrichment.updatedAt }).from(schema.companyEnrichment)
    .where(eq(schema.companyEnrichment.tenantId, tenantId)).orderBy(desc(schema.companyEnrichment.updatedAt)).limit(1);
  const [lastAiInsight] = await db.select({ createdAt: schema.conversationInsights.createdAt }).from(schema.conversationInsights)
    .where(eq(schema.conversationInsights.tenantId, tenantId)).orderBy(desc(schema.conversationInsights.createdAt)).limit(1);
  const [lastAiScore] = await db.select({ createdAt: schema.leadScores.createdAt }).from(schema.leadScores)
    .where(eq(schema.leadScores.tenantId, tenantId)).orderBy(desc(schema.leadScores.createdAt)).limit(1);
  const lastAiAt = [lastAiInsight?.createdAt, lastAiScore?.createdAt].filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0];

  function relativeTime(d?: Date | null): string {
    if (!d) return "No activity yet";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return `${Math.round(hours / 24)} day(s) ago`;
  }

  const integrations: Integration[] = [
    { name: "Apollo", status: process.env.APOLLO_API_KEY ? "connected" : "disconnected", note: "Company & contact enrichment", detailLabel: "Last Sync", detailValue: relativeTime(lastEnrichment?.updatedAt) },
    { name: "HubSpot", status: process.env.HUBSPOT_ACCESS_TOKEN ? "connected" : "needs_attention", note: process.env.HUBSPOT_ACCESS_TOKEN ? "CRM sync" : "Access token not configured" },
    { name: "Gemini", status: process.env.GEMINI_API_KEY ? "connected" : "disconnected", note: "Conversation intelligence & AI agents", detailLabel: "Last AI Request", detailValue: relativeTime(lastAiAt as Date | undefined) },
    { name: "AWS S3", status: process.env.AWS_ACCESS_KEY_ID ? "connected" : "disconnected", note: "Voice note storage", detailLabel: "Status", detailValue: "Storage Active" },
    { name: "AWS Transcribe", status: "needs_attention", note: "Account not yet subscribed for Transcribe in this AWS account" },
  ];

  // ── Recent activity — business-focused, with related lead/opportunity ────
  const recentActivity = await db
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      resourceType: schema.auditLogs.resourceType,
      resourceId: schema.auditLogs.resourceId,
      createdAt: schema.auditLogs.createdAt,
      userName: schema.users.name,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .where(and(eq(schema.auditLogs.tenantId, tenantId), inArray(schema.auditLogs.action, BUSINESS_ACTIONS)))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(10);

  const directLeadIds = recentActivity.filter(r => r.resourceType === "lead" && r.resourceId).map(r => r.resourceId!);
  const oppIds = recentActivity.filter(r => r.resourceType === "opportunity" && r.resourceId).map(r => r.resourceId!);
  const scoreIds = recentActivity.filter(r => r.resourceType === "lead_score" && r.resourceId).map(r => r.resourceId!);
  const followupIds = recentActivity.filter(r => r.resourceType === "followup" && r.resourceId).map(r => r.resourceId!);
  const crmSyncIds = recentActivity.filter(r => r.resourceType === "crm_sync" && r.resourceId).map(r => r.resourceId!);

  const companyById = new Map<string, string>();
  if (directLeadIds.length) {
    const rows = await db.select({ id: schema.leads.id, companyName: schema.leads.companyName }).from(schema.leads).where(inArray(schema.leads.id, directLeadIds));
    for (const r of rows) companyById.set(r.id, r.companyName);
  }
  const oppCompanyById = new Map<string, string>();
  if (oppIds.length) {
    const rows = await db.select({ id: schema.opportunities.id, companyName: schema.opportunities.companyName }).from(schema.opportunities).where(inArray(schema.opportunities.id, oppIds));
    for (const r of rows) oppCompanyById.set(r.id, r.companyName);
  }
  async function resolveViaLead(table: typeof schema.leadScores | typeof schema.followupRecommendations | typeof schema.crmSyncJobs, ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const rows = await db.select({ id: table.id, leadId: table.leadId }).from(table).where(inArray(table.id, ids));
    const leadIds = rows.map(r => r.leadId).filter(Boolean) as string[];
    if (!leadIds.length) return new Map<string, string>();
    const leadRows = await db.select({ id: schema.leads.id, companyName: schema.leads.companyName }).from(schema.leads).where(inArray(schema.leads.id, leadIds));
    const leadCompany = new Map(leadRows.map(l => [l.id, l.companyName]));
    return new Map(rows.map(r => [r.id, leadCompany.get(r.leadId) ?? ""]));
  }
  const [scoreCompanyById, followupCompanyById, crmSyncCompanyById] = await Promise.all([
    resolveViaLead(schema.leadScores, scoreIds),
    resolveViaLead(schema.followupRecommendations, followupIds),
    resolveViaLead(schema.crmSyncJobs, crmSyncIds),
  ]);

  const activityRows: ActivityRow[] = recentActivity.map((r) => {
    let related: string | null = null;
    if (r.resourceId) {
      if (r.resourceType === "lead") related = companyById.get(r.resourceId) ?? null;
      else if (r.resourceType === "opportunity") related = oppCompanyById.get(r.resourceId) ?? null;
      else if (r.resourceType === "lead_score") related = scoreCompanyById.get(r.resourceId) ?? null;
      else if (r.resourceType === "followup") related = followupCompanyById.get(r.resourceId) ?? null;
      else if (r.resourceType === "crm_sync") related = crmSyncCompanyById.get(r.resourceId) ?? null;
    }
    return { id: r.id, action: r.action, userName: r.userName, createdAt: r.createdAt.toISOString(), related };
  });

  const fields = [
    { label: "Name",      value: tenant.name },
    { label: "Slug",      value: tenant.slug,      mono: true },
    { label: "Subdomain", value: tenant.subdomain,  mono: true },
    { label: "Event",     value: tenant.eventName ?? "—" },
    { label: "Created",   value: new Date(tenant.createdAt).toLocaleString() },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Tenant Settings"
        description="Details about your organisation on this platform"
      />

      {/* Team Performance */}
      <div>
        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Team Performance</p>
        <KpiGrid items={kpis} />
      </div>

      {/* Current Event */}
      <CurrentEventCard event={currentEventData} />

      {/* Tenant Health + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TenantHealthCard health={health} />
        <QuickActionsPanel
          currentEventId={currentEventData?.id ?? null}
          hubspotConfigured={!!process.env.HUBSPOT_ACCESS_TOKEN}
          apolloConfigured={!!process.env.APOLLO_API_KEY}
        />
      </div>

      {/* Integrations + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <IntegrationsStatusCard integrations={integrations} />
        <RecentActivityCard rows={activityRows} />
      </div>

      {/* Subscription placeholder */}
      <SubscriptionPlaceholderCard />

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
