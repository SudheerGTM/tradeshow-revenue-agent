"use client";

import { useState, useEffect } from "react";
import {
  Briefcase, Loader2, AlertTriangle, Sparkles, ArrowRight, TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface OpportunityPreview {
  allowed: boolean;
  blockedReason?: string;
  requiresManagerOverride?: boolean;
  payload?: {
    opportunityName: string;
    stage: string;
    priority: string;
    amount: number | null;
    probability: number;
    expectedRevenue: number | null;
    nextStep: string;
    riskNotes: string;
    aiRecommendation: string;
  };
}

interface ExistingOpportunity {
  id: string;
  opportunityName: string;
  stage: string;
  amount: number | null;
  expectedRevenue: number | null;
}

interface Props { leadId: string; userRole: string; }

const STAGE_LABEL: Record<string, string> = {
  identified: "Identified", qualified: "Qualified", meeting_scheduled: "Meeting Scheduled",
  proposal_requested: "Proposal Requested", proposal_sent: "Proposal Sent",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

export function OpportunityPanel({ leadId, userRole }: Props) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<ExistingOpportunity | null>(null);
  const [preview, setPreview] = useState<OpportunityPreview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const canOverride = userRole === "manager" || userRole === "tenant_admin";

  useEffect(() => { checkExisting(); }, [leadId]);

  async function checkExisting() {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities?leadId=${leadId}`);
      if (res.ok) {
        const rows = await res.json() as { id: string; opportunityName: string; stage: string; amount: number | null; expectedRevenue: number | null }[];
        if (rows.length) setExisting(rows[0]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePrepare(managerOverride = false) {
    setPreparing(true);
    setError("");
    try {
      const res = await fetch("/api/opportunities/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, managerOverride }),
      });
      const data = await res.json();
      setPreview(data);
      if (!res.ok && !data.blockedReason) throw new Error(data.error ?? "Could not prepare opportunity");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare opportunity");
    } finally {
      setPreparing(false);
    }
  }

  async function handleCreate(managerOverride = false) {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, managerOverride }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create opportunity");
      setExisting({ id: data.id, opportunityName: data.opportunityName, stage: data.stage, amount: data.amount, expectedRevenue: data.expectedRevenue });
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create opportunity");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex justify-center shadow-sm">
        <Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" />
      </div>
    );
  }

  if (existing) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Opportunity</p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-[#dbeafe] text-[#0F4C81]">
            {STAGE_LABEL[existing.stage] ?? existing.stage}
          </span>
        </div>
        <p className="text-sm font-medium text-[#0F172A] mb-3">{existing.opportunityName}</p>
        <Link href={`/opportunities/${existing.id}`}>
          <Button variant="secondary" className="w-full">
            View Opportunity <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-[#0F4C81]" />
        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Opportunity</p>
      </div>

      {error && (
        <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>
      )}

      {!preview && (
        <Button onClick={() => handlePrepare(false)} loading={preparing} className="w-full">
          <Sparkles className="w-4 h-4" /> Create Opportunity
        </Button>
      )}

      {preview && !preview.allowed && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-[#fef3c7] border border-[#F59E0B]/30 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#d97706] shrink-0 mt-0.5" />
            <p className="text-xs text-[#92400e]">{preview.blockedReason}</p>
          </div>
          {preview.requiresManagerOverride && canOverride && (
            <Button onClick={() => handleCreate(true)} loading={creating} variant="secondary" className="w-full">
              Override &amp; Create Anyway (Manager)
            </Button>
          )}
        </div>
      )}

      {preview?.allowed && preview.payload && (
        <div className="space-y-3">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#0F172A]">{preview.payload.opportunityName}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-[#dbeafe] text-[#0F4C81]">
                {STAGE_LABEL[preview.payload.stage] ?? preview.payload.stage}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <PreviewStat label="Amount" value={preview.payload.amount != null ? `£${preview.payload.amount.toLocaleString("en-GB")}` : "—"} />
              <PreviewStat label="Probability" value={`${Math.round(preview.payload.probability * 100)}%`} />
              <PreviewStat label="Exp. Revenue" value={preview.payload.expectedRevenue != null ? `£${preview.payload.expectedRevenue.toLocaleString("en-GB")}` : "—"} />
            </div>
            {preview.payload.aiRecommendation && (
              <div className="pt-2 border-t border-[#E2E8F0]">
                <p className="text-[10px] text-[#94A3B8] mb-0.5 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> AI Recommendation</p>
                <p className="text-xs text-[#475569]">{preview.payload.aiRecommendation}</p>
              </div>
            )}
          </div>
          <Button onClick={() => handleCreate(false)} loading={creating} className="w-full">
            Confirm &amp; Create Opportunity
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-semibold text-[#0F172A]">{value}</p>
      <p className="text-[10px] text-[#94A3B8]">{label}</p>
    </div>
  );
}
