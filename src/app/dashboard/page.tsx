import { auth } from "@/lib/auth";
import { getTenantById } from "@/lib/tenant";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { eq, sql, isNull, and } from "drizzle-orm";
import {
  Users, Star, Mail, Mic, FileText, CheckCircle, XCircle, Clock,
  Brain, AlertTriangle, Zap, Package, Sparkles, Building2, TrendingUp,
  CalendarDays, BarChart2,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

export default async function DashboardPage() {
  const session = await auth();
  const cookieStore = await cookies();
  const slug = cookieStore.get("tenant_slug")?.value ?? "demo";
  const tenant = session?.user?.tenantId
    ? await getTenantById(session.user.tenantId)
    : null;

  let stats = { total: 0, new: 0, qualified: 0, disqualified: 0, contacted: 0 };
  let byEvent: { eventName: string | null; count: number }[] = [];
  let voiceStats = { total: 0, leadsWithNotes: 0 };
  let txStats = { total: 0, completed: 0, failed: 0, pending: 0 };
  let ciStats = { total: 0, needsReview: 0, highUrgency: 0 };
  let topProductInterests: string[] = [];
  let enrichStats = { leadsEnriched: 0, companiesEnriched: 0, successRate: 0, total: 0 };
  let topIndustries: string[] = [];
  let topCompanySizes: string[] = [];

  if (session?.user?.tenantId) {
    const tenantId = session.user.tenantId;

    const byStatus = await db
      .select({ status: schema.leads.status, count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(eq(schema.leads.tenantId, tenantId))
      .groupBy(schema.leads.status);

    for (const r of byStatus) {
      stats.total += r.count;
      if (r.status in stats) stats[r.status as keyof typeof stats] = r.count;
    }

    const eventRows = await db
      .select({ eventName: schema.events.name, count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .leftJoin(schema.events, eq(schema.leads.eventId, schema.events.id))
      .where(eq(schema.leads.tenantId, tenantId))
      .groupBy(schema.events.name)
      .orderBy(sql`count(*) desc`)
      .limit(5);
    byEvent = eventRows;

    const vnFilter = and(
      eq(schema.voiceNotes.tenantId, tenantId),
      eq(schema.voiceNotes.recordingStatus, "uploaded"),
      isNull(schema.voiceNotes.deletedAt)
    );
    const [vnTotal] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.voiceNotes).where(vnFilter);
    const [vnLeads] = await db.select({ count: sql<number>`count(distinct lead_id)::int` }).from(schema.voiceNotes).where(vnFilter);
    voiceStats = { total: vnTotal?.count ?? 0, leadsWithNotes: vnLeads?.count ?? 0 };

    const txByStatus = await db
      .select({ status: schema.transcripts.transcribeStatus, count: sql<number>`count(*)::int` })
      .from(schema.transcripts)
      .where(eq(schema.transcripts.tenantId, tenantId))
      .groupBy(schema.transcripts.transcribeStatus);
    for (const r of txByStatus) {
      txStats.total += r.count;
      if (r.status === "completed") txStats.completed = r.count;
      else if (r.status === "failed") txStats.failed = r.count;
      else if (r.status === "queued" || r.status === "in_progress") txStats.pending += r.count;
    }

    const ciByStatus = await db
      .select({ status: schema.conversationInsights.status, count: sql<number>`count(*)::int` })
      .from(schema.conversationInsights)
      .where(eq(schema.conversationInsights.tenantId, tenantId))
      .groupBy(schema.conversationInsights.status);
    for (const r of ciByStatus) {
      ciStats.total += r.count;
      if (r.status === "needs_review") ciStats.needsReview = r.count;
    }
    const [highUrgencyRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationInsights)
      .where(and(eq(schema.conversationInsights.tenantId, tenantId), eq(schema.conversationInsights.urgency, "high")));
    ciStats.highUrgency = highUrgencyRow?.count ?? 0;

    const recentInsights = await db
      .select({ productInterest: schema.conversationInsights.productInterest })
      .from(schema.conversationInsights)
      .where(and(eq(schema.conversationInsights.tenantId, tenantId), eq(schema.conversationInsights.status, "completed")))
      .limit(50);
    const interestCount: Record<string, number> = {};
    for (const row of recentInsights) {
      if (Array.isArray(row.productInterest)) {
        for (const item of row.productInterest as string[]) {
          if (item) interestCount[item] = (interestCount[item] ?? 0) + 1;
        }
      }
    }
    topProductInterests = Object.entries(interestCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);

    const companyRows = await db
      .select({ status: schema.companyEnrichment.enrichmentStatus, count: sql<number>`count(*)::int` })
      .from(schema.companyEnrichment)
      .where(eq(schema.companyEnrichment.tenantId, tenantId))
      .groupBy(schema.companyEnrichment.enrichmentStatus);
    for (const r of companyRows) {
      enrichStats.total += r.count;
      if (r.status === "enriched" || r.status === "partially_enriched") enrichStats.companiesEnriched += r.count;
    }
    const [enrichedLeads] = await db
      .select({ count: sql<number>`count(distinct lead_id)::int` })
      .from(schema.companyEnrichment)
      .where(and(eq(schema.companyEnrichment.tenantId, tenantId), eq(schema.companyEnrichment.enrichmentStatus, "enriched")));
    enrichStats.leadsEnriched = enrichedLeads?.count ?? 0;
    enrichStats.successRate = enrichStats.total > 0
      ? Math.round((enrichStats.companiesEnriched / enrichStats.total) * 100) : 0;

    const industryRows = await db
      .select({ industry: schema.companyEnrichment.industry, count: sql<number>`count(*)::int` })
      .from(schema.companyEnrichment)
      .where(and(eq(schema.companyEnrichment.tenantId, tenantId), eq(schema.companyEnrichment.enrichmentStatus, "enriched")))
      .groupBy(schema.companyEnrichment.industry)
      .orderBy(sql`count(*) desc`)
      .limit(5);
    topIndustries = industryRows.map(r => r.industry).filter(Boolean) as string[];

    const sizeRows = await db
      .select({ range: schema.companyEnrichment.employeeRange, count: sql<number>`count(*)::int` })
      .from(schema.companyEnrichment)
      .where(and(eq(schema.companyEnrichment.tenantId, tenantId), eq(schema.companyEnrichment.enrichmentStatus, "enriched")))
      .groupBy(schema.companyEnrichment.employeeRange)
      .orderBy(sql`count(*) desc`)
      .limit(5);
    topCompanySizes = sizeRows.map(r => r.range).filter(Boolean) as string[];
  }

  const tenantName = tenant?.name ?? (session?.user?.role === "platform_admin" ? "Platform Overview" : slug);
  const welcomeName = session?.user?.name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Dashboard</h1>
          <p className="text-sm text-[#475569] mt-0.5">
            {tenantName}{welcomeName ? ` · Welcome back, ${welcomeName}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#94A3B8]">Trade Show Revenue Agent</p>
          <p className="text-[11px] text-[#00B8D9] font-medium">Transform Every Conversation into Pipeline</p>
        </div>
      </div>

      {/* Primary KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Users}       label="Total Leads"     value={stats.total}     color="blue"     href="/leads" />
        <KpiCard icon={CalendarDays} label="Leads Captured"  value={stats.new}       color="turquoise" href="/leads?status=new" />
        <KpiCard icon={Star}        label="Qualified Leads"  value={stats.qualified}  color="success"  href="/leads?status=qualified" />
        <KpiCard icon={Mic}         label="Voice Notes"      value={voiceStats.total} color="purple"   href="/leads" />
        <KpiCard icon={TrendingUp}  label="Enrichment Rate"  value={`${enrichStats.successRate}%`} color="warning" href="/leads" />
      </div>

      {/* Conversation Intelligence row */}
      <div>
        <SectionHeader title="Conversation Intelligence" icon={Brain} href="/leads" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <KpiCard icon={Brain}         label="Total Insights"  value={ciStats.total}       color="blue"    href="/leads" />
          <KpiCard icon={AlertTriangle} label="Needs Review"    value={ciStats.needsReview}  color="warning" href="/leads" />
          <KpiCard icon={Zap}           label="High Urgency"    value={ciStats.highUrgency}  color="danger"  href="/leads" />
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-[#00B8D9]" />
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Top Interests</p>
            </div>
            {topProductInterests.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No insights yet</p>
            ) : (
              <div className="space-y-1.5">
                {topProductInterests.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-[#94A3B8] w-4 text-right font-medium">{i + 1}</span>
                    <span className="text-xs text-[#0F172A] truncate">{name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Company Intelligence row */}
      <div>
        <SectionHeader title="Company Intelligence" icon={Building2} href="/leads" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard icon={Sparkles}   label="Leads Enriched"  value={enrichStats.leadsEnriched}    color="blue"    href="/leads" />
            <KpiCard icon={Building2}  label="Companies Found" value={enrichStats.companiesEnriched} color="turquoise" href="/leads" />
            <KpiCard icon={TrendingUp} label="Success Rate"    value={`${enrichStats.successRate}%`} color="success" href="/leads" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Top Industries</p>
              {topIndustries.length === 0 ? (
                <p className="text-xs text-[#94A3B8]">No data yet</p>
              ) : (
                <div className="space-y-1.5">
                  {topIndustries.map((ind, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#94A3B8] w-3 font-medium">{i + 1}</span>
                      <span className="text-xs text-[#0F172A] truncate">{ind}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Company Sizes</p>
              {topCompanySizes.length === 0 ? (
                <p className="text-xs text-[#94A3B8]">No data yet</p>
              ) : (
                <div className="space-y-1.5">
                  {topCompanySizes.map((size, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#94A3B8] w-3 font-medium">{i + 1}</span>
                      <span className="text-xs text-[#0F172A] truncate">{size}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transcription + Voice row */}
      <div>
        <SectionHeader title="Voice & Transcription" icon={Mic} href="/leads" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <KpiCard icon={FileText}    label="Total Transcriptions"     value={txStats.total}     color="blue"    href="/leads" />
          <KpiCard icon={CheckCircle} label="Completed"                value={txStats.completed}  color="success" href="/leads" />
          <KpiCard icon={Clock}       label="Pending"                  value={txStats.pending}    color="warning" href="/leads" />
          <KpiCard icon={XCircle}     label="Failed"                   value={txStats.failed}     color="danger"  href="/leads" />
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads by event */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#0F172A]">Leads by Event</h2>
            <Link href="/events" className="text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium">
              Manage events →
            </Link>
          </div>
          {byEvent.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-4 text-center">No leads captured yet.</p>
          ) : (
            <div className="space-y-2.5">
              {byEvent.map((row, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-[#475569] truncate">{row.eventName ?? "No event"}</span>
                  <Badge variant="blue">{row.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0F172A] mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: "/leads/new", label: "Capture a Lead",   desc: "Add a new contact from the booth floor", icon: Users },
              { href: "/leads",     label: "View All Leads",   desc: "Search, filter and manage your pipeline", icon: BarChart2 },
              { href: "/events",    label: "Manage Events",    desc: "Create or view trade show events", icon: CalendarDays },
            ].map(({ href, label, desc, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#e6f8fc] flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-[#00B8D9]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">{label}</p>
                  <p className="text-xs text-[#94A3B8]">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  title, icon: Icon, href,
}: { title: string; icon: React.ComponentType<{ className?: string }>; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[#0F4C81]" />
        <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
      </div>
      <Link href={href} className="text-xs text-[#94A3B8] hover:text-[#475569] transition">
        View all →
      </Link>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, color, href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; color: string; href: string;
}) {
  const colorMap: Record<string, { icon: string; bg: string }> = {
    blue:      { icon: "text-[#0F4C81]",  bg: "bg-[#dbeafe]" },
    turquoise: { icon: "text-[#00B8D9]",  bg: "bg-[#e6f8fc]" },
    success:   { icon: "text-[#16A34A]",  bg: "bg-[#dcfce7]" },
    warning:   { icon: "text-[#d97706]",  bg: "bg-[#fef3c7]" },
    danger:    { icon: "text-[#DC2626]",  bg: "bg-[#fee2e2]" },
    purple:    { icon: "text-purple-600", bg: "bg-purple-50" },
  };
  const c = colorMap[color] ?? colorMap.blue;

  return (
    <Link href={href} className="bg-white border border-[#E2E8F0] rounded-xl p-5 hover:border-[#CBD5E1] hover:shadow-md transition block shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.bg}`}>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
      <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
    </Link>
  );
}
