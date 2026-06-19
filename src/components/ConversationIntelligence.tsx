"use client";

import { useState, useEffect } from "react";
import {
  Brain, AlertTriangle, CheckCircle, Clock, Loader2,
  ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type InputSource = "manual_transcript" | "transcript_table" | "lead_notes";
type Urgency = "low" | "medium" | "high" | "unknown";
type Status = "completed" | "failed" | "needs_review";

interface InsightRow {
  id: string;
  inputSource: InputSource;
  painPoints: string[] | null;
  productInterest: string[] | null;
  businessNeed: string | null;
  urgency: Urgency;
  timeline: string | null;
  budgetSignal: string | null;
  decisionMakerSignal: string | null;
  competitorMentioned: string | null;
  nextBestAction: string | null;
  summary: string | null;
  recommendedFollowUp: string | null;
  confidenceScore: string | null;
  aiModelUsed: string | null;
  status: Status;
  failureReason: string | null;
  createdAt: string;
}

interface Props {
  leadId: string;
  leadNotes?: string | null;
  availableTranscriptId?: string | null;
}

export function ConversationIntelligence({ leadId, leadNotes, availableTranscriptId }: Props) {
  const [source, setSource] = useState<InputSource>("manual_transcript");
  const [manualText, setManualText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { fetchInsights(); }, [leadId]);

  async function fetchInsights() {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversation-insights?lead_id=${leadId}`);
      if (res.ok) setInsights(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    setError("");
    setAnalyzing(true);
    try {
      const body: Record<string, string> = { leadId, inputSource: source };
      if (source === "manual_transcript") body.inputText = manualText;
      if (source === "transcript_table" && availableTranscriptId) body.transcriptId = availableTranscriptId;

      const res = await fetch("/api/conversation-insights/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");

      await fetchInsights();
      setExpandedId(data.id);
      if (source === "manual_transcript") setManualText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const canAnalyze = source === "manual_transcript"
    ? manualText.trim().length > 20
    : source === "transcript_table"
    ? !!availableTranscriptId
    : !!leadNotes;

  return (
    <div className="space-y-5">
      {/* Input card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-400 shrink-0" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Conversation Intelligence
          </p>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-300/80">
            AI insights are suggestions. Please review before using them for sales follow-up.
          </p>
        </div>

        {/* Source selector */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Analyze from:</p>
          <div className="flex gap-2 flex-wrap">
            {([
              { value: "manual_transcript", label: "Manual Transcript" },
              { value: "transcript_table", label: "Existing Transcript", disabled: !availableTranscriptId },
              { value: "lead_notes", label: "Lead Notes", disabled: !leadNotes },
            ] as { value: InputSource; label: string; disabled?: boolean }[]).map(opt => (
              <button
                key={opt.value}
                disabled={opt.disabled}
                onClick={() => setSource(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                  source === opt.value
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : opt.disabled
                    ? "border-gray-800 text-gray-600 cursor-not-allowed"
                    : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                }`}
              >
                {opt.label}
                {opt.disabled && " (unavailable)"}
              </button>
            ))}
          </div>
        </div>

        {/* Manual text input */}
        {source === "manual_transcript" && (
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder="Paste or type the conversation transcript or notes here…"
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        )}

        {source === "transcript_table" && availableTranscriptId && (
          <p className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2.5">
            Will use the existing completed transcript for this lead.
          </p>
        )}

        {source === "lead_notes" && leadNotes && (
          <div className="bg-gray-800 rounded-lg px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-1">Lead notes preview:</p>
            <p className="text-xs text-gray-300 line-clamp-4">{leadNotes}</p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          onClick={handleAnalyze}
          disabled={!canAnalyze || analyzing}
          loading={analyzing}
          className="w-full"
        >
          <Brain className="w-4 h-4" />
          {analyzing ? "Analyzing…" : "Analyze Conversation"}
        </Button>
      </div>

      {/* Past insights */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        <div className="px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Intelligence Reports
          </p>
          <button onClick={fetchInsights} className="text-gray-600 hover:text-gray-400 transition">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
          </div>
        ) : insights.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Brain className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No intelligence reports yet</p>
          </div>
        ) : (
          insights.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              expanded={expandedId === insight.id}
              onToggle={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── InsightCard ──────────────────────────────────────────────────────────────

function InsightCard({
  insight, expanded, onToggle,
}: { insight: InsightRow; expanded: boolean; onToggle: () => void }) {
  const confidence = insight.confidenceScore ? Math.round(Number(insight.confidenceScore)) : null;

  return (
    <div className="px-5 py-4">
      {/* Header row */}
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={insight.status} />
              <UrgencyBadge urgency={insight.urgency} />
              {confidence !== null && (
                <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                  {confidence}% confidence
                </span>
              )}
              <span className="text-[10px] text-gray-600">
                {new Date(insight.createdAt).toLocaleString()}
              </span>
            </div>
            {insight.summary && (
              <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{insight.summary}</p>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Summary */}
          {insight.summary && (
            <Field label="Summary" value={insight.summary} />
          )}

          {/* Arrays */}
          {insight.painPoints && (insight.painPoints as string[]).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Pain Points</p>
              <ul className="space-y-1">
                {(insight.painPoints as string[]).map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.productInterest && (insight.productInterest as string[]).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Product Interest</p>
              <div className="flex flex-wrap gap-1.5">
                {(insight.productInterest as string[]).map((p, i) => (
                  <span key={i} className="text-xs bg-indigo-950/50 border border-indigo-800/50 text-indigo-300 px-2 py-0.5 rounded-full">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <Field label="Business Need" value={insight.businessNeed} />
            <Field label="Timeline" value={insight.timeline} />
            <Field label="Budget Signal" value={insight.budgetSignal} />
            <Field label="Decision Maker Signal" value={insight.decisionMakerSignal} />
            <Field label="Competitor Mentioned" value={insight.competitorMentioned} />
          </div>

          {insight.nextBestAction && (
            <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">Next Best Action</p>
              <p className="text-xs text-indigo-200">{insight.nextBestAction}</p>
            </div>
          )}

          {insight.recommendedFollowUp && (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Recommended Follow-up</p>
              <p className="text-xs text-emerald-200">{insight.recommendedFollowUp}</p>
            </div>
          )}

          {insight.status === "needs_review" && (
            <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">Low confidence — please review before acting on these insights.</p>
            </div>
          )}

          {insight.aiModelUsed && (
            <p className="text-[11px] text-gray-600">Model: {insight.aiModelUsed}</p>
          )}

          {insight.failureReason && (
            <p className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">{insight.failureReason}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs text-gray-300">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map = {
    completed:    { icon: CheckCircle, cls: "text-emerald-400", label: "Completed" },
    needs_review: { icon: AlertTriangle, cls: "text-amber-400", label: "Needs Review" },
    failed:       { icon: AlertTriangle, cls: "text-red-400", label: "Failed" },
  };
  const { icon: Icon, cls, label } = map[status] ?? map.failed;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const map: Record<Urgency, string> = {
    high:    "text-red-400 bg-red-950/40",
    medium:  "text-yellow-400 bg-yellow-950/40",
    low:     "text-emerald-400 bg-emerald-950/40",
    unknown: "text-gray-500 bg-gray-800",
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${map[urgency]}`}>
      {urgency} urgency
    </span>
  );
}
