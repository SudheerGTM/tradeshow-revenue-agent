"use client";

import { Lightbulb, HelpCircle, ClipboardCheck, AlertCircle } from "lucide-react";
import { ConversationIntelligence } from "@/components/ConversationIntelligence";
import type { ConversationInsightSummary } from "./types";
import { toArray } from "./types";

interface Props {
  leadId: string;
  leadNotes: string | null;
  availableTranscriptId: string | null;
  insight: ConversationInsightSummary | null;
}

export function ConversationIntelTab({ leadId, leadNotes, availableTranscriptId, insight }: Props) {
  const discoveryQuestions = buildDiscoveryQuestions(insight);
  const qualificationQuestions = buildQualificationQuestions(insight);
  const missing = buildMissingInfo(insight);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <ConversationIntelligence leadId={leadId} leadNotes={leadNotes} availableTranscriptId={availableTranscriptId} />
      </div>

      <div className="space-y-4">
        <PanelCard icon={Lightbulb} title="AI Recommendations" color="#0F4C81">
          {insight?.nextBestAction ? (
            <p className="text-sm text-[#0F172A]">{insight.nextBestAction}</p>
          ) : (
            <Empty text="Run an analysis to get a recommended next action." />
          )}
        </PanelCard>

        <PanelCard icon={HelpCircle} title="Suggested Discovery Questions" color="#00B8D9">
          {discoveryQuestions.length ? (
            <ul className="space-y-1.5">
              {discoveryQuestions.map((q, i) => <li key={i} className="text-sm text-[#0F172A]">• {q}</li>)}
            </ul>
          ) : <Empty text="No conversation data yet to suggest questions." />}
        </PanelCard>

        <PanelCard icon={ClipboardCheck} title="Suggested Qualification Questions" color="#16A34A">
          {qualificationQuestions.length ? (
            <ul className="space-y-1.5">
              {qualificationQuestions.map((q, i) => <li key={i} className="text-sm text-[#0F172A]">• {q}</li>)}
            </ul>
          ) : <Empty text="No conversation data yet to suggest questions." />}
        </PanelCard>

        <PanelCard icon={AlertCircle} title="Missing Information" color="#F59E0B">
          {missing.length ? (
            <ul className="space-y-1.5">
              {missing.map((m, i) => <li key={i} className="text-sm text-[#92400e]">• {m}</li>)}
            </ul>
          ) : <Empty text="All key qualification fields are captured." />}
        </PanelCard>
      </div>
    </div>
  );
}

function PanelCard({ icon: Icon, title, color, children }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-[#94A3B8]">{text}</p>;
}

// Deterministic, template-based suggestions derived from already-captured
// conversation data — no new AI calls, no backend changes.
function buildDiscoveryQuestions(insight: ConversationInsightSummary | null): string[] {
  if (!insight) return [];
  const qs: string[] = [];
  const painPoints = toArray(insight.painPoints);
  if (painPoints.length) qs.push(`Can you tell me more about ${painPoints[0].toLowerCase()}?`);
  if (insight.businessNeed) qs.push(`What's driving the need around "${insight.businessNeed}" right now?`);
  const products = toArray(insight.productInterest);
  if (products.length) qs.push(`What outcome are you hoping for from ${products[0]}?`);
  if (!insight.timeline || insight.timeline.toLowerCase() === "unknown") qs.push("What's your ideal timeline for addressing this?");
  return qs.slice(0, 4);
}

function buildQualificationQuestions(insight: ConversationInsightSummary | null): string[] {
  if (!insight) return [];
  const qs: string[] = [];
  if (!insight.budgetSignal) qs.push("Is there budget allocated for this initiative?");
  if (!insight.decisionMakerSignal) qs.push("Who else is involved in evaluating a solution like this?");
  if (!insight.competitorMentioned) qs.push("Are you currently evaluating any other providers?");
  qs.push("What would success look like in the first 90 days?");
  return qs.slice(0, 4);
}

function buildMissingInfo(insight: ConversationInsightSummary | null): string[] {
  if (!insight) return ["No conversation captured yet."];
  const missing: string[] = [];
  if (!insight.budgetSignal) missing.push("Budget signal not captured");
  if (!insight.decisionMakerSignal) missing.push("Decision maker not confirmed");
  if (!insight.timeline || insight.timeline.toLowerCase() === "unknown") missing.push("Timeline not confirmed");
  if (!toArray(insight.productInterest).length) missing.push("Product interest not identified");
  return missing;
}
