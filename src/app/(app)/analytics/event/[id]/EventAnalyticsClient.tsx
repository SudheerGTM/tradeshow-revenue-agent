"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, DollarSign, Users, Star, TrendingUp, Trophy, Flame, Thermometer,
  Snowflake, AlertTriangle, Mic, Brain, Mail, RefreshCw, Loader2, Sparkles, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ROIData {
  eventName: string;
  metrics: {
    totalEventCost: number; totalLeads: number; qualifiedLeads: number; hotLeads: number;
    warmLeads: number; coldLeads: number; needsReviewLeads: number; opportunitiesCreated: number;
    pipelineGenerated: number; expectedRevenue: number; wonRevenue: number; lostRevenue: number;
    roiPercentage: number | null; costPerLead: number | null; costPerQualifiedLead: number | null; costPerOpportunity: number | null;
    pipelineByStage: { stage: string; count: number; amount: number }[];
    pipelineByPriority: { priority: string; count: number; amount: number }[];
    expectedRevenueByStage: { stage: string; expectedRevenue: number }[];
    voiceNotesCount: number; conversationAnalysesCount: number; followUpsGeneratedCount: number; crmSyncCompletedCount: number;
    topOpportunities: { id: string; opportunityName: string; expectedRevenue: number | null; amount: number | null }[];
  };
  executiveSummary: string | null;
  summaryGeneratedAt: string | null;
  summaryConfidenceScore: string | null;
}

function fmt(n: number): string { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

export function EventAnalyticsClient({ eventId, userRole }: { eventId: string; userRole: string }) {
  const [data, setData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [error, setError] = useState("");

  const canGenerateSummary = userRole === "manager" || userRole === "tenant_admin";
  const canExport = userRole === "tenant_admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/roi`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleGenerateSummary() {
    setGeneratingSummary(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}/executive-summary`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate summary");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setGeneratingSummary(false);
    }
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#CBD5E1]" /></div>;
  }

  const m = data.metrics;
  const roiColor = m.roiPercentage == null ? "#94A3B8" : m.roiPercentage >= 0 ? "#16A34A" : "#DC2626";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/events" className="text-[#94A3B8] hover:text-[#475569] mt-0.5 transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">{data.eventName} · Executive Dashboard</h1>
            <p className="text-sm text-[#475569] mt-0.5">Was this trade show worth the investment?</p>
          </div>
        </div>
        <Link href={`/events/${eventId}/report`}>
          <Button variant="secondary"><FileText className="w-4 h-4" /> Full Report</Button>
        </Link>
      </div>

      {/* Executive Summary */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Executive Summary</p>
          </div>
          {canGenerateSummary && (
            <Button onClick={handleGenerateSummary} loading={generatingSummary} variant="secondary" size="sm">
              <RefreshCw className="w-3.5 h-3.5" /> {data.executiveSummary ? "Regenerate" : "Generate"}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-[#DC2626] bg-[#fee2e2] rounded-xl px-3 py-2">{error}</p>}
        {data.executiveSummary ? (
          <>
            <p className="text-sm text-[#0F172A] leading-relaxed">{data.executiveSummary}</p>
            <p className="text-[11px] text-[#94A3B8]">
              Generated {data.summaryGeneratedAt ? new Date(data.summaryGeneratedAt).toLocaleString() : ""}
              {data.summaryConfidenceScore && ` · ${Math.round(parseFloat(data.summaryConfidenceScore))}% confidence`}
            </p>
          </>
        ) : (
          <p className="text-xs text-[#94A3B8]">No executive summary generated yet.</p>
        )}
      </div>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card icon={DollarSign} label="Event Cost" value={fmt(m.totalEventCost)} color="blue" />
        <Card icon={Users} label="Leads Captured" value={String(m.totalLeads)} color="turquoise" />
        <Card icon={Star} label="Qualified Leads" value={String(m.qualifiedLeads)} color="success" />
        <Card icon={TrendingUp} label="Pipeline Generated" value={fmt(m.pipelineGenerated)} color="blue" />
        <Card icon={TrendingUp} label="Expected Revenue" value={fmt(m.expectedRevenue)} color="success" />
        <Card icon={Trophy} label="Won Revenue" value={fmt(m.wonRevenue)} color="success" />
        <Card icon={TrendingUp} label="ROI %" value={m.roiPercentage != null ? `${m.roiPercentage}%` : "n/a"} color="custom" customColor={roiColor} />
        <Card icon={DollarSign} label="Cost Per Lead" value={m.costPerLead != null ? fmt(m.costPerLead) : "n/a"} color="warning" />
      </div>

      {/* Pipeline Section */}
      <Section title="Pipeline">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Pipeline by Stage">
            <BarList items={m.pipelineByStage.map(s => ({ label: s.stage.replace(/_/g, " "), value: s.count, sub: fmt(s.amount) }))} color="#0F4C81" />
          </ChartCard>
          <ChartCard title="Pipeline by Priority">
            <BarList items={m.pipelineByPriority.map(p => ({ label: p.priority, value: p.count, sub: fmt(p.amount) }))} color="#00B8D9" />
          </ChartCard>
        </div>
        <ChartCard title="Expected Revenue by Stage">
          <BarList items={m.expectedRevenueByStage.map(s => ({ label: s.stage.replace(/_/g, " "), value: s.expectedRevenue, sub: fmt(s.expectedRevenue), valueIsAmount: true }))} color="#16A34A" />
        </ChartCard>
      </Section>

      {/* Lead Conversion Funnel */}
      <Section title="Lead Conversion Funnel">
        <ChartCard title="From Capture to Opportunity">
          <Funnel steps={[
            { label: "Leads Captured", value: m.totalLeads, color: "#0F4C81" },
            { label: "Qualified (Hot+Warm)", value: m.qualifiedLeads, color: "#00B8D9" },
            { label: "Hot Leads", value: m.hotLeads, color: "#F59E0B" },
            { label: "Opportunities Created", value: m.opportunitiesCreated, color: "#16A34A" },
          ]} />
        </ChartCard>
      </Section>

      {/* Lead Quality */}
      <Section title="Lead Quality">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card icon={Flame} label="Hot Leads" value={String(m.hotLeads)} color="danger" />
          <Card icon={Thermometer} label="Warm Leads" value={String(m.warmLeads)} color="warning" />
          <Card icon={Snowflake} label="Cold Leads" value={String(m.coldLeads)} color="blue" />
          <Card icon={AlertTriangle} label="Needs Review" value={String(m.needsReviewLeads)} color="turquoise" />
        </div>
      </Section>

      {/* Revenue Waterfall */}
      <Section title="Revenue Waterfall">
        <ChartCard title="Cost → Pipeline → Expected → Won">
          <Waterfall steps={[
            { label: "Event Cost", value: -m.totalEventCost, color: "#DC2626" },
            { label: "Pipeline", value: m.pipelineGenerated, color: "#0F4C81" },
            { label: "Expected Revenue", value: m.expectedRevenue, color: "#00B8D9" },
            { label: "Won Revenue", value: m.wonRevenue, color: "#16A34A" },
          ]} />
        </ChartCard>
      </Section>

      {/* Activity */}
      <Section title="Activity">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card icon={Mic} label="Voice Notes Captured" value={String(m.voiceNotesCount)} color="blue" />
          <Card icon={Brain} label="Conversation Analyses" value={String(m.conversationAnalysesCount)} color="turquoise" />
          <Card icon={Mail} label="Follow-Ups Generated" value={String(m.followUpsGeneratedCount)} color="warning" />
          <Card icon={RefreshCw} label="CRM Sync Completed" value={String(m.crmSyncCompletedCount)} color="success" />
        </div>
      </Section>

      {/* Top opportunities */}
      <Section title="Top Opportunities">
        <ChartCard title="">
          {m.topOpportunities.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No active opportunities for this event yet.</p>
          ) : (
            <div className="space-y-2">
              {m.topOpportunities.map(o => (
                <Link key={o.id} href={`/opportunities/${o.id}`} className="flex items-center justify-between group">
                  <span className="text-sm text-[#0F172A] group-hover:text-[#0F4C81] truncate">{o.opportunityName}</span>
                  <span className="text-sm font-semibold text-[#16A34A] shrink-0 ml-3">{o.expectedRevenue != null ? fmt(o.expectedRevenue) : "—"}</span>
                </Link>
              ))}
            </div>
          )}
        </ChartCard>
      </Section>

      {!canExport && (
        <p className="text-xs text-[#94A3B8] text-center">Report export (PDF/Excel) is available to tenant admins from the Event Report page.</p>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
      {children}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
      {title && <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-3">{title}</p>}
      {children}
    </div>
  );
}

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue: { bg: "#dbeafe", text: "#0F4C81" },
  turquoise: { bg: "#e6f8fc", text: "#00B8D9" },
  success: { bg: "#dcfce7", text: "#16A34A" },
  warning: { bg: "#fef3c7", text: "#d97706" },
  danger: { bg: "#fee2e2", text: "#DC2626" },
};

function Card({ icon: Icon, label, value, color, customColor }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color: string; customColor?: string;
}) {
  const c = color === "custom" ? { bg: "#F1F5F9", text: customColor ?? "#0F172A" } : (COLOR_MAP[color] ?? COLOR_MAP.blue);
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: c.bg }}>
        <Icon className="w-4 h-4" style={{ color: c.text }} />
      </div>
      <p className="text-xl font-bold text-[#0F172A]">{value}</p>
      <p className="text-xs text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}

function BarList({ items, color }: { items: { label: string; value: number; sub: string; valueIsAmount?: boolean }[]; color: string }) {
  if (items.length === 0) return <p className="text-xs text-[#94A3B8]">No data yet.</p>;
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-[#475569] capitalize">{item.label}</span>
            <span className="text-xs font-medium text-[#0F172A]">{item.sub}</span>
          </div>
          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const widthPct = Math.max(8, (step.value / max) * 100);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-[#475569] w-40 shrink-0 truncate">{step.label}</span>
            <div className="flex-1 h-7 bg-[#F1F5F9] rounded-lg overflow-hidden flex items-center">
              <div
                className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                style={{ width: `${widthPct}%`, background: step.color }}
              >
                <span className="text-xs font-semibold text-white">{step.value}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Waterfall({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const maxAbs = Math.max(...steps.map(s => Math.abs(s.value)), 1);
  return (
    <div className="grid grid-cols-4 gap-3">
      {steps.map((step, i) => {
        const heightPct = Math.max(4, (Math.abs(step.value) / maxAbs) * 100);
        return (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-full h-32 bg-[#F8FAFC] rounded-lg flex items-end overflow-hidden">
              <div className="w-full rounded-t-lg transition-all" style={{ height: `${heightPct}%`, background: step.color }} />
            </div>
            <span className="text-xs font-semibold text-[#0F172A]">{step.value < 0 ? "-" : ""}£{Math.abs(step.value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>
            <span className="text-[10px] text-[#94A3B8] text-center">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
