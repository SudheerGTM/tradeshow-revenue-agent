"use client";

import { useState, useEffect } from "react";
import {
  Star, Loader2, RefreshCw, AlertTriangle, CheckCircle,
  Zap, TrendingUp, ShieldAlert, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Classification = "hot" | "warm" | "cold" | "needs_review";

interface ScoreRecord {
  id: string;
  score: string;
  classification: Classification;
  companyFitScore: string;
  authorityScore: string;
  needScore: string;
  urgencyScore: string;
  engagementScore: string;
  dataQualityScore: string;
  estimatedOpportunityValue: string | null;
  estimatedCloseProbability: string | null;
  expectedRevenue: string | null;
  scoreExplanation: string | null;
  scoreDrivers: unknown;
  risks: unknown;
  recommendedNextAction: string | null;
  confidenceScore: string | null;
  needsHumanReview: boolean;
  modelUsed: string | null;
  status: string;
  failureReason: string | null;
  createdAt: string;
}

interface Props { leadId: string; }

const CLASSIFICATION_STYLE: Record<Classification, { label: string; bg: string; text: string; border: string }> = {
  hot:          { label: "Hot",          bg: "#fee2e2", text: "#DC2626", border: "#DC2626" },
  warm:         { label: "Warm",         bg: "#fef3c7", text: "#d97706", border: "#F59E0B" },
  cold:         { label: "Cold",         bg: "#dbeafe", text: "#0F4C81", border: "#0F4C81" },
  needs_review: { label: "Needs Review", bg: "#f1f5f9", text: "#64748B", border: "#CBD5E1" },
};

function fmt(val: string | null | undefined, prefix = ""): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${prefix}${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function fmtPct(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export function LeadScorePanel({ leadId }: Props) {
  const toast = useToast();
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { fetchScores(); }, [leadId]);

  async function fetchScores() {
    setLoading(true);
    try {
      const res = await fetch(`/api/lead-scores?lead_id=${leadId}`);
      if (res.ok) setScores(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/lead-scores/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scoring failed");
      await fetchScores();
      toast.success(`Lead scored ${Math.round(parseFloat(data.score))}/100 — ${data.classification}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scoring failed";
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex justify-center shadow-sm">
        <Loader2 className="w-5 h-5 animate-spin text-[#CBD5E1]" />
      </div>
    );
  }

  const latest = scores[0] ?? null;
  const cls = latest ? CLASSIFICATION_STYLE[latest.classification] : null;

  return (
    <div className="space-y-4">
      {/* Score card */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Lead Score</p>
          </div>
          {latest && (
            <button onClick={fetchScores} className="text-[#CBD5E1] hover:text-[#94A3B8] transition">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-5">
          {latest ? (
            <>
              {/* Score + classification */}
              <div className="flex items-start gap-4">
                <div
                  className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0"
                  style={{ background: cls?.bg, border: `2px solid ${cls?.border}` }}
                >
                  <span className="text-3xl font-bold leading-none" style={{ color: cls?.text }}>
                    {Math.round(parseFloat(latest.score))}
                  </span>
                  <span className="text-[10px] font-medium mt-0.5" style={{ color: cls?.text }}>/100</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <ClassificationBadge cls={latest.classification} />
                    {latest.needsHumanReview && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-[#d97706] bg-[#fef3c7] px-2 py-0.5 rounded-lg">
                        <AlertTriangle className="w-3 h-3" /> Needs Review
                      </span>
                    )}
                  </div>
                  {latest.scoreExplanation && (
                    <p className="text-xs text-[#475569] leading-relaxed">{latest.scoreExplanation}</p>
                  )}
                </div>
              </div>

              {/* Score breakdown */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider">Score Breakdown</p>
                {[
                  { label: "Company Fit",       value: latest.companyFitScore,  max: 25 },
                  { label: "Authority",          value: latest.authorityScore,   max: 20 },
                  { label: "Need / Pain",        value: latest.needScore,        max: 20 },
                  { label: "Urgency / Timeline", value: latest.urgencyScore,     max: 15 },
                  { label: "Engagement",         value: latest.engagementScore,  max: 10 },
                  { label: "Data Quality",       value: latest.dataQualityScore, max: 10 },
                ].map(({ label, value, max }) => {
                  const v = parseFloat(value ?? "0");
                  const pct = Math.round((v / max) * 100);
                  return (
                    <div key={label}>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[11px] text-[#94A3B8]">{label}</span>
                        <span className="text-[11px] font-medium text-[#0F172A]">{Math.round(v)}/{max}</span>
                      </div>
                      <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: pct >= 70 ? "#16A34A" : pct >= 40 ? "#00B8D9" : "#CBD5E1" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Opportunity value */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Opportunity Value", value: fmt(latest.estimatedOpportunityValue, "£"), icon: TrendingUp },
                  { label: "Close Probability",  value: fmtPct(latest.estimatedCloseProbability), icon: CheckCircle },
                  { label: "Expected Revenue",   value: fmt(latest.expectedRevenue, "£"), icon: Zap },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0] text-center">
                    <Icon className="w-3.5 h-3.5 text-[#00B8D9] mx-auto mb-1" />
                    <p className="text-sm font-bold text-[#0F172A]">{value}</p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Drivers */}
              {toArray(latest.scoreDrivers).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider mb-2">Score Drivers</p>
                  <ul className="space-y-1">
                    {toArray(latest.scoreDrivers).map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#0F172A]">
                        <CheckCircle className="w-3.5 h-3.5 text-[#16A34A] shrink-0 mt-0.5" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risks */}
              {toArray(latest.risks).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#475569] uppercase tracking-wider mb-2">Risks</p>
                  <ul className="space-y-1">
                    {toArray(latest.risks).map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#0F172A]">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#d97706] shrink-0 mt-0.5" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended next action */}
              {latest.recommendedNextAction && (
                <div className="bg-[#dbeafe] border border-[#0F4C81]/20 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-[#0F4C81] uppercase tracking-wider mb-1">Recommended Next Action</p>
                  <p className="text-xs text-[#0F4C81]">{latest.recommendedNextAction}</p>
                </div>
              )}

              {/* Needs review notice */}
              {latest.needsHumanReview && (
                <div className="flex items-center gap-2 bg-[#fef3c7] border border-[#F59E0B]/30 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#d97706] shrink-0" />
                  <p className="text-xs text-[#92400e]">
                    Low confidence or missing data — please review this score before acting on it.
                  </p>
                </div>
              )}

              {/* Meta */}
              <p className="text-[11px] text-[#94A3B8]">
                Generated by: {latest.modelUsed ?? "deterministic"} · {new Date(latest.createdAt).toLocaleString()}
                {latest.confidenceScore && ` · ${Math.round(parseFloat(latest.confidenceScore))}% confidence`}
              </p>
            </>
          ) : (
            <div className="text-center py-4">
              <Star className="w-10 h-10 text-[#E2E8F0] mx-auto mb-3" />
              <p className="text-sm font-medium text-[#0F172A] mb-1">No Score Yet</p>
              <p className="text-xs text-[#94A3B8]">
                Generate a score to see opportunity value, classification, and recommended next action.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <Button
            onClick={handleGenerate}
            loading={generating}
            variant={latest ? "secondary" : "primary"}
            className="w-full"
          >
            <Star className="w-4 h-4" />
            {latest ? "Regenerate Score" : "Generate Lead Score"}
          </Button>
        </div>
      </div>

      {/* Score history */}
      {scores.length > 1 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-[#475569] uppercase tracking-wider hover:bg-[#F8FAFC] transition"
          >
            Score History ({scores.length - 1} previous)
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showHistory && (
            <div className="divide-y divide-[#F8FAFC]">
              {scores.slice(1).map(s => (
                <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{ background: CLASSIFICATION_STYLE[s.classification].bg, color: CLASSIFICATION_STYLE[s.classification].text }}
                  >
                    {Math.round(parseFloat(s.score))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <ClassificationBadge cls={s.classification} />
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">{new Date(s.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClassificationBadge({ cls }: { cls: Classification }) {
  const s = CLASSIFICATION_STYLE[cls];
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-lg"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}30` }}
    >
      {s.label}
    </span>
  );
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}
