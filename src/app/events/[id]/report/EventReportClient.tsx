"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface ReportData {
  event: { id: string; name: string; location: string | null; startDate: string | null; endDate: string | null; status: string };
  metrics: {
    totalEventCost: number; totalLeads: number; qualifiedLeads: number; hotLeads: number;
    opportunitiesCreated: number; pipelineGenerated: number; expectedRevenue: number; wonRevenue: number;
    roiPercentage: number | null; costPerLead: number | null; costPerQualifiedLead: number | null; costPerOpportunity: number | null;
  };
  executiveSummary: string | null;
  costs: { id: string; costCategory: string; description: string | null; amount: number }[];
  topOpportunities: { id: string; opportunityName: string; companyName: string; stage: string; amount: number | null; expectedRevenue: number | null }[];
}

function fmt(n: number): string { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

export function EventReportClient({ eventId, userRole }: { eventId: string; userRole: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const canExport = userRole === "tenant_admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/report`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleExport(format: "pdf" | "excel") {
    setExporting(format);
    try {
      const res = await fetch(`/api/events/${eventId}/export/${format}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event-roi-report.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#CBD5E1]" /></div>;
  }

  const { event, metrics, executiveSummary, costs, topOpportunities } = data;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/events" className="text-[#94A3B8] hover:text-[#475569] mt-0.5 transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#0F172A]">{event.name} — ROI Report</h1>
            <p className="text-sm text-[#475569] mt-0.5">{event.location ?? ""} {event.startDate ? `· ${event.startDate} → ${event.endDate ?? ""}` : ""}</p>
          </div>
        </div>
        {canExport ? (
          <div className="flex gap-2">
            <Button onClick={() => handleExport("pdf")} loading={exporting === "pdf"} variant="secondary">
              <FileText className="w-4 h-4" /> Export PDF
            </Button>
            <Button onClick={() => handleExport("excel")} loading={exporting === "excel"} variant="secondary">
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </Button>
          </div>
        ) : (
          <p className="text-xs text-[#94A3B8]">Export available to tenant admins only</p>
        )}
      </div>

      {/* Executive Summary */}
      <ReportSection title="Executive Summary">
        <p className="text-sm text-[#0F172A] leading-relaxed">{executiveSummary ?? "No executive summary generated yet — visit the Executive Dashboard to generate one."}</p>
      </ReportSection>

      {/* Event Overview */}
      <ReportSection title="Event Overview">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status"><Badge variant="blue">{event.status}</Badge></Field>
          <Field label="Location" value={event.location ?? "—"} />
          <Field label="Start Date" value={event.startDate ?? "—"} />
          <Field label="End Date" value={event.endDate ?? "—"} />
        </div>
      </ReportSection>

      {/* Lead Performance */}
      <ReportSection title="Lead Performance">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total Leads" value={String(metrics.totalLeads)} />
          <Stat label="Qualified Leads" value={String(metrics.qualifiedLeads)} />
          <Stat label="Hot Leads" value={String(metrics.hotLeads)} />
        </div>
      </ReportSection>

      {/* Pipeline Performance */}
      <ReportSection title="Pipeline Performance">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Opportunities Created" value={String(metrics.opportunitiesCreated)} />
          <Stat label="Pipeline Generated" value={fmt(metrics.pipelineGenerated)} />
          <Stat label="Expected Revenue" value={fmt(metrics.expectedRevenue)} />
        </div>
      </ReportSection>

      {/* Top Opportunities */}
      <ReportSection title="Top Opportunities">
        {topOpportunities.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No active opportunities for this event.</p>
        ) : (
          <div className="divide-y divide-[#F8FAFC]">
            {topOpportunities.map(o => (
              <div key={o.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <Link href={`/opportunities/${o.id}`} className="text-sm font-medium text-[#0F172A] hover:text-[#0F4C81]">{o.opportunityName}</Link>
                  <p className="text-xs text-[#94A3B8]">{o.companyName} · {o.stage.replace(/_/g, " ")}</p>
                </div>
                <span className="text-sm font-semibold text-[#16A34A]">{o.expectedRevenue != null ? fmt(o.expectedRevenue) : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      {/* ROI Analysis */}
      <ReportSection title="ROI Analysis">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Event Cost" value={fmt(metrics.totalEventCost)} />
          <Stat label="Won Revenue" value={fmt(metrics.wonRevenue)} />
          <Stat label="ROI %" value={metrics.roiPercentage != null ? `${metrics.roiPercentage}%` : "n/a"} highlight={metrics.roiPercentage != null && metrics.roiPercentage >= 0 ? "success" : "danger"} />
          <Stat label="Cost Per Lead" value={metrics.costPerLead != null ? fmt(metrics.costPerLead) : "n/a"} />
        </div>
        {costs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-2">Cost Breakdown</p>
            <div className="divide-y divide-[#F8FAFC]">
              {costs.map(c => (
                <div key={c.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-[#475569] capitalize">{c.costCategory} {c.description ? `— ${c.description}` : ""}</span>
                  <span className="font-medium text-[#0F172A]">{fmt(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ReportSection>

      {/* Recommended Actions */}
      <ReportSection title="Recommended Actions">
        <ul className="space-y-1.5 text-sm text-[#0F172A]">
          {metrics.hotLeads > 0 && <li>• Follow up with {metrics.hotLeads} Hot lead(s) that may not yet have an opportunity.</li>}
          {metrics.opportunitiesCreated === 0 && <li>• No opportunities created yet — review Hot/Warm leads on the Leads page.</li>}
          {metrics.roiPercentage != null && metrics.roiPercentage < 0 && <li>• Current ROI is negative — review event cost allocation and accelerate pipeline progression.</li>}
          {metrics.totalEventCost === 0 && <li>• No event costs recorded yet — add costs to enable ROI calculation.</li>}
        </ul>
      </ReportSection>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3">
      <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-[#94A3B8]">{label}</p>
      {children ?? <p className="text-sm text-[#0F172A]">{value}</p>}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "success" | "danger" }) {
  const color = highlight === "success" ? "#16A34A" : highlight === "danger" ? "#DC2626" : "#0F172A";
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}
