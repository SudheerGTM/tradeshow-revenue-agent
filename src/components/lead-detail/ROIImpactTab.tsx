"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, TrendingUp, Users, Star, Briefcase, Zap, BarChart3, ArrowRight } from "lucide-react";
import { fmtGBP } from "./types";

interface EventRoiResponse {
  eventName: string;
  metrics: {
    totalLeads: number; qualifiedLeads: number; pipelineGenerated: number; expectedRevenue: number;
    roiPercentage: number | null;
  };
}

interface Props {
  eventId: string | null;
  leadExpectedRevenue: number | null;
}

export function ROIImpactTab({ eventId, leadExpectedRevenue }: Props) {
  const [data, setData] = useState<EventRoiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!eventId) { setLoading(false); return; }
    fetch(`/api/events/${eventId}/roi`)
      .then(async r => {
        if (!r.ok) { setError((await r.json()).error ?? "No access to event ROI data"); return; }
        setData(await r.json());
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  if (!eventId) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-10 text-center">
        <p className="text-sm text-[#94A3B8]">This lead isn&apos;t linked to an event — ROI impact isn&apos;t available.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" /></div>;
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6">
        <p className="text-sm text-[#94A3B8]">{error || "ROI data unavailable."}</p>
      </div>
    );
  }

  const contributionPct = leadExpectedRevenue && data.metrics.expectedRevenue > 0
    ? Math.round((leadExpectedRevenue / data.metrics.expectedRevenue) * 1000) / 10
    : null;

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">{data.eventName} — Event Performance</p>
          <Link href={`/analytics/event/${eventId}`} className="text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium flex items-center gap-1">
            Full Dashboard <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat icon={Users} label="Leads Captured" value={String(data.metrics.totalLeads)} color="#0F4C81" bg="#dbeafe" />
          <Stat icon={Star} label="Qualified Leads" value={String(data.metrics.qualifiedLeads)} color="#16A34A" bg="#dcfce7" />
          <Stat icon={Briefcase} label="Pipeline Generated" value={fmtGBP(data.metrics.pipelineGenerated)} color="#00B8D9" bg="#e6f8fc" />
          <Stat icon={Zap} label="Expected Revenue" value={fmtGBP(data.metrics.expectedRevenue)} color="#16A34A" bg="#dcfce7" />
          <Stat icon={BarChart3} label="ROI %" value={data.metrics.roiPercentage != null ? `${data.metrics.roiPercentage}%` : "n/a"} color="#d97706" bg="#fef3c7" />
        </div>
      </div>

      <div className="bg-white border border-[#0F4C81]/20 rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-[#0F4C81]" />
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Lead Contribution</p>
        </div>
        <div className="flex items-center gap-8">
          <div>
            <p className="text-3xl font-bold text-[#16A34A]">{fmtGBP(leadExpectedRevenue)}</p>
            <p className="text-xs text-[#94A3B8] mt-1">Potential Revenue</p>
          </div>
          {contributionPct != null && (
            <div>
              <p className="text-3xl font-bold text-[#0F4C81]">{contributionPct}%</p>
              <p className="text-xs text-[#94A3B8] mt-1">of Event Expected Revenue</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color, bg }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color: string; bg: string;
}) {
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: bg }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <p className="text-lg font-bold text-[#0F172A] truncate">{value}</p>
      <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}
