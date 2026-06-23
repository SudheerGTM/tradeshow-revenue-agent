"use client";

import { useState, useEffect } from "react";
import { Phone, Loader2, ListChecks, Target } from "lucide-react";
import { FollowUpPanel } from "@/components/FollowUpPanel";
import type { ConversationInsightSummary } from "./types";
import { toArray } from "./types";

interface FollowupDraft {
  id: string;
  followupType: string;
  messageContent: string | null;
  callToAction: string | null;
  createdAt: string;
}

interface Props {
  leadId: string;
  userRole: string;
  insight: ConversationInsightSummary | null;
}

export function FollowUpTab({ leadId, userRole, insight }: Props) {
  const [callScripts, setCallScripts] = useState<FollowupDraft[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(true);

  useEffect(() => {
    fetch(`/api/followups?lead_id=${leadId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: FollowupDraft[]) => setCallScripts(rows.filter(r => r.followupType === "phone_call")))
      .finally(() => setLoadingScripts(false));
  }, [leadId]);

  const objectives = buildMeetingObjectives(insight);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <FollowUpPanel leadId={leadId} userRole={userRole} />
      </div>

      <div className="space-y-4">
        {/* Discovery Call Script */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#0F4C81]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Discovery Call Script</p>
          </div>
          {loadingScripts ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#CBD5E1]" />
          ) : callScripts.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No call script generated yet. Use Generate Follow-Up and select Phone Call.</p>
          ) : (
            <div className="space-y-3">
              {callScripts.map(s => (
                <div key={s.id} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
                  <p className="text-xs text-[#0F172A] whitespace-pre-wrap leading-relaxed">{s.messageContent}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-[#00B8D9]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Suggested Questions</p>
          </div>
          <ul className="space-y-1.5">
            {buildQuestions(insight).map((q, i) => <li key={i} className="text-sm text-[#0F172A]">• {q}</li>)}
          </ul>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#16A34A]" />
            <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Next Meeting Objectives</p>
          </div>
          <ul className="space-y-1.5">
            {objectives.map((o, i) => <li key={i} className="text-sm text-[#0F172A]">• {o}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function buildQuestions(insight: ConversationInsightSummary | null): string[] {
  const qs: string[] = [];
  if (!insight) return ["What challenges are you currently facing in this area?"];
  const painPoints = toArray(insight.painPoints);
  if (painPoints.length) qs.push(`How is "${painPoints[0]}" impacting the business today?`);
  if (!insight.budgetSignal) qs.push("Has budget been allocated for a solution like this?");
  if (!insight.decisionMakerSignal) qs.push("Who else needs to be involved in this decision?");
  qs.push("What would need to be true for this to become a priority?");
  return qs.slice(0, 4);
}

function buildMeetingObjectives(insight: ConversationInsightSummary | null): string[] {
  const objectives = ["Confirm current systems and reporting processes in place."];
  if (insight?.timeline && insight.timeline.toLowerCase() !== "unknown") {
    objectives.push(`Validate timeline against stated goal: ${insight.timeline}.`);
  } else {
    objectives.push("Establish a realistic timeline for evaluation.");
  }
  objectives.push("Identify the economic buyer and decision process.");
  return objectives;
}
