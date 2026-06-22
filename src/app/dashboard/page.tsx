import { auth } from "@/lib/auth";
import { getTenantById } from "@/lib/tenant";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { eq, sql, isNull, and, desc } from "drizzle-orm";
import {
  Users, Star, Mail, Mic, FileText, CheckCircle, XCircle, Clock,
  Brain, AlertTriangle, Zap, Package, Sparkles, Building2, TrendingUp,
  CalendarDays, BarChart2, Flame, Thermometer, Snowflake, Inbox,
  RefreshCw, Briefcase, ClipboardList, Trophy, ThumbsDown, Kanban,
  DollarSign, BarChart3,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";

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
  let scoreStats = { hot: 0, warm: 0, cold: 0, needsReview: 0, totalPipeline: 0, expectedRevenue: 0 };
  let topScoredLeads: { id: string; firstName: string; lastName: string | null; companyName: string; score: string; classification: string; expectedRevenue: string | null }[] = [];
  let followupStats = { total: 0, highPriority: 0, needsReview: 0, approved: 0, draft: 0 };
  let crmStats = { pending: 0, completed: 0, failed: 0, dealsCreated: 0, tasksCreated: 0 };
  let oppStats = { openPipeline: 0, expectedRevenue: 0, created: 0, won: 0, lost: 0, avgValue: 0 };
  let oppByStage: { stage: string; count: number }[] = [];
  let topOpportunities: { id: string; opportunityName: string; expectedRevenue: string | null }[] = [];
  let hotLeadsWithoutOpp = 0;
  let roiStats = { totalEventCost: 0, totalPipeline: 0, expectedRevenue: 0, wonRevenue: 0, roiPercentage: null as number | null };
  let bestEvent: { name: string; roiPercentage: number } | null = null;

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

    // Lead scoring stats
    const scoreByClass = await db
      .select({ classification: schema.leadScores.classification, count: sql<number>`count(distinct lead_id)::int` })
      .from(schema.leadScores)
      .where(eq(schema.leadScores.tenantId, tenantId))
      .groupBy(schema.leadScores.classification);

    for (const r of scoreByClass) {
      if (r.classification === "hot") scoreStats.hot = r.count;
      else if (r.classification === "warm") scoreStats.warm = r.count;
      else if (r.classification === "cold") scoreStats.cold = r.count;
      else if (r.classification === "needs_review") scoreStats.needsReview = r.count;
    }

    const [pipelineRow] = await db
      .select({
        totalPipeline: sql<string>`sum(estimated_opportunity_value)`,
        expectedRevenue: sql<string>`sum(expected_revenue)`,
      })
      .from(schema.leadScores)
      .where(eq(schema.leadScores.tenantId, tenantId));

    scoreStats.totalPipeline = Math.round(parseFloat(pipelineRow?.totalPipeline ?? "0") || 0);
    scoreStats.expectedRevenue = Math.round(parseFloat(pipelineRow?.expectedRevenue ?? "0") || 0);

    // Top scored leads
    topScoredLeads = await db
      .selectDistinctOn([schema.leadScores.leadId], {
        id: schema.leads.id,
        firstName: schema.leads.firstName,
        lastName: schema.leads.lastName,
        companyName: schema.leads.companyName,
        score: schema.leadScores.score,
        classification: schema.leadScores.classification,
        expectedRevenue: schema.leadScores.expectedRevenue,
      })
      .from(schema.leadScores)
      .innerJoin(schema.leads, eq(schema.leadScores.leadId, schema.leads.id))
      .where(and(eq(schema.leadScores.tenantId, tenantId), eq(schema.leadScores.classification, "hot")))
      .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
      .limit(5) as typeof topScoredLeads;

    // Follow-up stats
    const followupByStatus = await db
      .select({ status: schema.followupRecommendations.status, count: sql<number>`count(*)::int` })
      .from(schema.followupRecommendations)
      .where(eq(schema.followupRecommendations.tenantId, tenantId))
      .groupBy(schema.followupRecommendations.status);

    for (const r of followupByStatus) {
      followupStats.total += r.count;
      if (r.status === "approved") followupStats.approved = r.count;
      else if (r.status === "draft") followupStats.draft = r.count;
    }

    const [highPriorityRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.followupRecommendations)
      .where(and(eq(schema.followupRecommendations.tenantId, tenantId), eq(schema.followupRecommendations.priority, "high")));
    followupStats.highPriority = highPriorityRow?.count ?? 0;

    const [followupReviewRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.followupRecommendations)
      .where(and(eq(schema.followupRecommendations.tenantId, tenantId), eq(schema.followupRecommendations.needsHumanReview, true)));
    followupStats.needsReview = followupReviewRow?.count ?? 0;

    // CRM sync stats
    const crmByStatus = await db
      .select({ status: schema.crmSyncJobs.syncStatus, count: sql<number>`count(*)::int` })
      .from(schema.crmSyncJobs)
      .where(eq(schema.crmSyncJobs.tenantId, tenantId))
      .groupBy(schema.crmSyncJobs.syncStatus);

    for (const r of crmByStatus) {
      if (r.status === "pending_approval") crmStats.pending = r.count;
      else if (r.status === "completed") crmStats.completed = r.count;
      else if (r.status === "failed") crmStats.failed = r.count;
    }

    const [dealsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.crmSyncJobs)
      .where(and(eq(schema.crmSyncJobs.tenantId, tenantId), sql`${schema.crmSyncJobs.hubspotDealId} IS NOT NULL`));
    crmStats.dealsCreated = dealsRow?.count ?? 0;

    const [tasksRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.crmSyncJobs)
      .where(and(eq(schema.crmSyncJobs.tenantId, tenantId), sql`${schema.crmSyncJobs.hubspotTaskId} IS NOT NULL`));
    crmStats.tasksCreated = tasksRow?.count ?? 0;

    // Opportunity & pipeline stats
    const [openPipelineRow] = await db
      .select({ sum: sql<string>`coalesce(sum(amount), 0)`, count: sql<number>`count(*)::int` })
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")));
    oppStats.openPipeline = Math.round(parseFloat(openPipelineRow?.sum ?? "0"));

    const [expectedRevRow] = await db
      .select({ sum: sql<string>`coalesce(sum(expected_revenue), 0)` })
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")));
    oppStats.expectedRevenue = Math.round(parseFloat(expectedRevRow?.sum ?? "0"));

    const [createdRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.tenantId, tenantId));
    oppStats.created = createdRow?.count ?? 0;

    const [wonRow] = await db
      .select({ count: sql<number>`count(*)::int`, sum: sql<string>`coalesce(sum(amount), 0)` })
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "won")));
    oppStats.won = wonRow?.count ?? 0;

    const [lostRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "lost")));
    oppStats.lost = lostRow?.count ?? 0;

    oppStats.avgValue = oppStats.created > 0 ? Math.round(openPipelineRow ? parseFloat(openPipelineRow.sum) / oppStats.created : 0) : 0;

    const stageRows = await db
      .select({ stage: schema.opportunities.stage, count: sql<number>`count(*)::int` })
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
      .groupBy(schema.opportunities.stage);
    oppByStage = stageRows;

    topOpportunities = await db
      .select({ id: schema.opportunities.id, opportunityName: schema.opportunities.opportunityName, expectedRevenue: schema.opportunities.expectedRevenue })
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")))
      .orderBy(desc(schema.opportunities.expectedRevenue))
      .limit(5);

    // Hot leads without an opportunity yet
    const hotLeadsSq = db
      .selectDistinctOn([schema.leadScores.leadId], { leadId: schema.leadScores.leadId, classification: schema.leadScores.classification })
      .from(schema.leadScores)
      .where(eq(schema.leadScores.tenantId, tenantId))
      .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
      .as("hot_leads_sq");

    const hotWithoutOppRows = await db
      .select({ leadId: hotLeadsSq.leadId })
      .from(hotLeadsSq)
      .leftJoin(schema.opportunities, and(eq(schema.opportunities.leadId, hotLeadsSq.leadId), eq(schema.opportunities.tenantId, tenantId)))
      .where(and(eq(hotLeadsSq.classification, "hot"), sql`${schema.opportunities.id} IS NULL`));
    hotLeadsWithoutOpp = hotWithoutOppRows.length;

    // ROI analytics — aggregate across all tenant events
    const tenantEvents = await db.select({ id: schema.events.id, name: schema.events.name }).from(schema.events).where(eq(schema.events.tenantId, tenantId));
    let bestRoi = -Infinity;
    for (const ev of tenantEvents) {
      const { result } = await recalculateAndStoreROI(ev.id, tenantId, session.user.id);
      roiStats.totalEventCost += result.totalEventCost;
      roiStats.totalPipeline += result.pipelineGenerated;
      roiStats.expectedRevenue += result.expectedRevenue;
      roiStats.wonRevenue += result.wonRevenue;
      if (result.roiPercentage != null && result.roiPercentage > bestRoi) {
        bestRoi = result.roiPercentage;
        bestEvent = { name: ev.name, roiPercentage: result.roiPercentage };
      }
    }
    roiStats.roiPercentage = roiStats.totalEventCost > 0
      ? Math.round(((roiStats.wonRevenue - roiStats.totalEventCost) / roiStats.totalEventCost) * 10000) / 100
      : null;
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

      {/* Lead Scoring row */}
      <div>
        <SectionHeader title="Lead Scoring" icon={Star} href="/leads" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <KpiCard icon={Flame}       label="Hot Leads"         value={scoreStats.hot}          color="danger"    href="/leads?classification=hot" />
          <KpiCard icon={Thermometer} label="Warm Leads"        value={scoreStats.warm}         color="warning"   href="/leads?classification=warm" />
          <KpiCard icon={Snowflake}   label="Cold Leads"        value={scoreStats.cold}         color="blue"      href="/leads?classification=cold" />
          <KpiCard icon={AlertTriangle} label="Needs Review"    value={scoreStats.needsReview}  color="turquoise" href="/leads?classification=needs_review" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <KpiCard icon={TrendingUp} label="Estimated Pipeline" value={scoreStats.totalPipeline > 0 ? `£${(scoreStats.totalPipeline / 1000).toFixed(0)}k` : "—"} color="blue" href="/leads" />
            <KpiCard icon={Zap}        label="Expected Revenue"   value={scoreStats.expectedRevenue > 0 ? `£${(scoreStats.expectedRevenue / 1000).toFixed(0)}k` : "—"} color="success" href="/leads" />
          </div>
          {/* Top Hot Leads */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4 text-[#DC2626]" />
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Top Hot Leads</p>
            </div>
            {topScoredLeads.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No hot leads yet — generate scores to see them here</p>
            ) : (
              <div className="space-y-2">
                {topScoredLeads.map((lead) => (
                  <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center gap-2 group">
                    <div className="w-8 h-8 rounded-lg bg-[#fee2e2] flex items-center justify-center shrink-0 text-xs font-bold text-[#DC2626]">
                      {Math.round(parseFloat(lead.score))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#0F172A] group-hover:text-[#0F4C81] truncate">
                        {lead.firstName} {lead.lastName ?? ""}
                      </p>
                      <p className="text-[11px] text-[#94A3B8] truncate">{lead.companyName}</p>
                    </div>
                    {lead.expectedRevenue && (
                      <span className="text-[11px] font-medium text-[#16A34A] shrink-0">
                        £{parseFloat(lead.expectedRevenue).toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Follow-Up Intelligence row */}
      <div>
        <SectionHeader title="Follow-Up Intelligence" icon={Mail} href="/followups" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-3">
          <KpiCard icon={Inbox}         label="Follow-Ups Generated" value={followupStats.total}        color="blue"      href="/followups" />
          <KpiCard icon={Flame}         label="High Priority"        value={followupStats.highPriority}  color="danger"    href="/followups" />
          <KpiCard icon={AlertTriangle} label="Needs Review"         value={followupStats.needsReview}   color="warning"   href="/followups" />
          <KpiCard icon={CheckCircle}   label="Approved Drafts"      value={followupStats.approved}      color="success"   href="/followups" />
          <KpiCard icon={Clock}         label="Pending Drafts"       value={followupStats.draft}         color="turquoise" href="/followups" />
        </div>
      </div>

      {/* CRM Sync row */}
      <div>
        <SectionHeader title="CRM Sync" icon={RefreshCw} href="/crm-sync" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-3">
          <KpiCard icon={Clock}           label="CRM Sync Pending"   value={crmStats.pending}      color="turquoise" href="/crm-sync" />
          <KpiCard icon={CheckCircle}     label="CRM Sync Completed" value={crmStats.completed}    color="success"   href="/crm-sync" />
          <KpiCard icon={XCircle}         label="CRM Sync Failed"    value={crmStats.failed}       color="danger"    href="/crm-sync" />
          <KpiCard icon={Briefcase}       label="Deals Created"      value={crmStats.dealsCreated} color="blue"      href="/crm-sync" />
          <KpiCard icon={ClipboardList}   label="Tasks Created"      value={crmStats.tasksCreated} color="warning"   href="/crm-sync" />
        </div>
      </div>

      {/* ROI Analytics row */}
      <div>
        <SectionHeader title="ROI Analytics" icon={BarChart3} href="/roi-analytics" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-3">
          <KpiCard icon={DollarSign} label="Total Event Cost" value={`£${(roiStats.totalEventCost / 1000).toFixed(0)}k`} color="blue"      href="/roi-analytics" />
          <KpiCard icon={TrendingUp} label="Total Pipeline"   value={`£${(roiStats.totalPipeline / 1000).toFixed(0)}k`}   color="turquoise" href="/roi-analytics" />
          <KpiCard icon={Zap}        label="Expected Revenue" value={`£${(roiStats.expectedRevenue / 1000).toFixed(0)}k`} color="success"   href="/roi-analytics" />
          <KpiCard icon={Trophy}     label="Won Revenue"      value={`£${(roiStats.wonRevenue / 1000).toFixed(0)}k`}      color="success"   href="/roi-analytics" />
          <KpiCard icon={BarChart3}  label="ROI %"            value={roiStats.roiPercentage != null ? `${roiStats.roiPercentage}%` : "n/a"} color={roiStats.roiPercentage != null && roiStats.roiPercentage >= 0 ? "success" : "danger"} href="/roi-analytics" />
        </div>
        {bestEvent && (
          <div className="bg-white rounded-xl border border-[#16A34A]/30 p-4 shadow-sm mt-4 flex items-center gap-3">
            <Trophy className="w-5 h-5 text-[#16A34A] shrink-0" />
            <p className="text-sm text-[#0F172A]"><span className="font-semibold">Best Performing Event:</span> {bestEvent.name} ({bestEvent.roiPercentage}% ROI)</p>
          </div>
        )}
      </div>

      {/* Pipeline & Opportunities row */}
      <div>
        <SectionHeader title="Pipeline & Opportunities" icon={Kanban} href="/pipeline" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <KpiCard icon={TrendingUp} label="Open Pipeline"    value={`£${(oppStats.openPipeline / 1000).toFixed(0)}k`}    color="blue"      href="/opportunities" />
          <KpiCard icon={Zap}        label="Expected Revenue" value={`£${(oppStats.expectedRevenue / 1000).toFixed(0)}k`} color="success"   href="/opportunities" />
          <KpiCard icon={Trophy}     label="Won Opportunities" value={oppStats.won}  color="success" href="/opportunities?status=won" />
          <KpiCard icon={ThumbsDown} label="Lost Opportunities" value={oppStats.lost} color="danger"  href="/opportunities?status=lost" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <KpiCard icon={Briefcase}  label="Opportunities Created" value={oppStats.created} color="turquoise" href="/opportunities" />
          <KpiCard icon={AlertTriangle} label="Hot Leads Without Opportunity" value={hotLeadsWithoutOpp} color="warning" href="/leads?classification=hot" />
          <KpiCard icon={TrendingUp} label="Avg. Opportunity Value" value={oppStats.avgValue > 0 ? `£${oppStats.avgValue.toLocaleString("en-GB")}` : "—"} color="blue" href="/opportunities" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* Pipeline by stage */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Pipeline by Stage</p>
            {oppByStage.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No active opportunities yet</p>
            ) : (
              <div className="space-y-1.5">
                {oppByStage.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-[#0F172A] capitalize">{s.stage.replace(/_/g, " ")}</span>
                    <Badge variant="blue">{s.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top opportunities */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">Top Opportunities</p>
            {topOpportunities.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No opportunities yet</p>
            ) : (
              <div className="space-y-2">
                {topOpportunities.map((o) => (
                  <Link key={o.id} href={`/opportunities/${o.id}`} className="flex items-center justify-between group">
                    <span className="text-xs text-[#0F172A] group-hover:text-[#0F4C81] truncate">{o.opportunityName}</span>
                    <span className="text-xs font-semibold text-[#16A34A] shrink-0 ml-2">
                      {o.expectedRevenue != null ? `£${parseFloat(o.expectedRevenue).toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
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
