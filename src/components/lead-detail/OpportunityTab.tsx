"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Briefcase, ArrowRight, Sparkles } from "lucide-react";
import { OpportunityPanel } from "@/components/OpportunityPanel";
import { Badge } from "@/components/ui/Badge";
import { fmtGBP } from "./types";

interface OppDetail {
  id: string;
  opportunityName: string;
  stage: string;
  priority: string;
  amount: number | null;
  probability: number | null;
  expectedRevenue: number | null;
  expectedCloseDate: string | null;
  status: string;
  ownerName: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  identified: "Identified", qualified: "Qualified", meeting_scheduled: "Meeting Scheduled",
  proposal_requested: "Proposal Requested", proposal_sent: "Proposal Sent",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

export function OpportunityTab({ leadId, userRole }: { leadId: string; userRole: string }) {
  const [opp, setOpp] = useState<OppDetail | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [nextStep, setNextStep] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/opportunities?leadId=${leadId}`)
      .then(r => r.ok ? r.json() : [])
      .then(async (rows: OppDetail[]) => {
        if (rows.length) {
          setOpp(rows[0]);
          const detailRes = await fetch(`/api/opportunities/${rows[0].id}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            setAiRecommendation(detail.opportunity?.aiRecommendation ?? null);
            setNextStep(detail.opportunity?.nextStep ?? null);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [leadId]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" /></div>;
  }

  if (!opp) {
    return (
      <div className="max-w-xl">
        <OpportunityPanel leadId={leadId} userRole={userRole} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Opportunity Summary</p>
          </div>
          <Badge variant="blue">{STAGE_LABEL[opp.stage] ?? opp.stage}</Badge>
        </div>
        <p className="text-lg font-bold text-[#0F172A]">{opp.opportunityName}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value" value={fmtGBP(opp.amount)} />
          <Field label="Probability" value={opp.probability != null ? `${Math.round(opp.probability * 100)}%` : "—"} />
          <Field label="Expected Revenue" value={fmtGBP(opp.expectedRevenue)} highlight />
          <Field label="Owner" value={opp.ownerName ?? "Unassigned"} />
          <Field label="Expected Close Date" value={opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString() : "—"} />
          <Field label="Status" value={opp.status} />
        </div>
        <Link href={`/opportunities/${opp.id}`}>
          <span className="text-sm text-[#00B8D9] hover:text-[#009ab8] font-medium flex items-center gap-1">
            Open full opportunity <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      </div>

      <div className="space-y-4">
        {nextStep && (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5">
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-1.5">Next Step</p>
            <p className="text-sm text-[#0F172A]">{nextStep}</p>
          </div>
        )}
        {aiRecommendation && (
          <div className="bg-[#dbeafe] border border-[#0F4C81]/15 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0F4C81]" />
              <p className="text-xs font-semibold text-[#0F4C81] uppercase tracking-wider">AI Recommended Action</p>
            </div>
            <p className="text-sm text-[#0F4C81]">{aiRecommendation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-[#94A3B8]">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-[#16A34A]" : "text-[#0F172A]"}`}>{value}</p>
    </div>
  );
}
