"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Event } from "@/db/schema";

type Stage = "identified" | "qualified" | "meeting_scheduled" | "proposal_requested" | "proposal_sent" | "negotiation" | "won" | "lost";
type Priority = "high" | "medium" | "low";
type Status = "active" | "won" | "lost" | "archived";

interface OppRow {
  id: string;
  opportunityName: string;
  companyName: string;
  contactName: string | null;
  stage: Stage;
  priority: Priority;
  amount: number | null;
  probability: number | null;
  expectedRevenue: number | null;
  expectedCloseDate: string | null;
  status: Status;
  ownerName: string | null;
  createdAt: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  identified: "Identified", qualified: "Qualified", meeting_scheduled: "Meeting Scheduled",
  proposal_requested: "Proposal Requested", proposal_sent: "Proposal Sent",
  negotiation: "Negotiation", won: "Won", lost: "Lost",
};

const PRIORITY_VARIANT: Record<Priority, "red" | "yellow" | "blue"> = { high: "red", medium: "yellow", low: "blue" };
const STATUS_VARIANT: Record<Status, "blue" | "green" | "red" | "gray"> = { active: "blue", won: "green", lost: "red", archived: "gray" };

interface Props {
  userRole: string;
  events: Event[];
  users: { id: string; name: string }[];
}

export function OpportunitiesClient({ events, users }: Props) {
  const [rows, setRows] = useState<OppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState("");
  const [priority, setPriority] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("expectedRevenue");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy });
    if (stage) params.set("stage", stage);
    if (priority) params.set("priority", priority);
    if (ownerId) params.set("ownerId", ownerId);
    if (eventId) params.set("eventId", eventId);
    if (status) params.set("status", status);
    const res = await fetch(`/api/opportunities?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [stage, priority, ownerId, eventId, status, sortBy]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">Opportunities</h1>
          <p className="text-sm text-[#475569] mt-0.5">Trade show leads tracked as pipeline opportunities</p>
        </div>
        <Link href="/pipeline" className="text-sm text-[#00B8D9] hover:text-[#009ab8] font-medium">
          View Pipeline Board →
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        <FilterSelect value={stage} onChange={setStage} placeholder="All Stages" options={Object.entries(STAGE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        <FilterSelect value={priority} onChange={setPriority} placeholder="All Priorities" options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
        <FilterSelect value={ownerId} onChange={setOwnerId} placeholder="All Owners" options={users.map(u => ({ value: u.id, label: u.name }))} />
        <FilterSelect value={eventId} onChange={setEventId} placeholder="All Events" options={events.map(e => ({ value: e.id, label: e.name }))} />
        <FilterSelect value={status} onChange={setStatus} placeholder="All Statuses" options={[{ value: "active", label: "Active" }, { value: "won", label: "Won" }, { value: "lost", label: "Lost" }, { value: "archived", label: "Archived" }]} />
        <FilterSelect value={sortBy} onChange={setSortBy} placeholder="Sort" options={[{ value: "expectedRevenue", label: "Sort: Expected Revenue" }, { value: "amount", label: "Sort: Amount" }, { value: "closeDate", label: "Sort: Close Date" }]} />
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="divide-y divide-[#F8FAFC]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                {[...Array(6)].map((__, j) => <div key={j} className="h-4 bg-[#F1F5F9] rounded animate-pulse flex-1" />)}
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Briefcase} title="No opportunities found" description="Create an opportunity from a Hot or Warm lead's detail page." />
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-[#F8FAFC]">
              {rows.map(row => (
                <Link key={row.id} href={`/opportunities/${row.id}`} className="block p-4 active:bg-[#F8FAFC]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[#0F172A] truncate">{row.opportunityName}</p>
                      <p className="text-xs text-[#475569] truncate mt-0.5">{row.companyName}</p>
                    </div>
                    <Badge variant="blue" className="shrink-0">{STAGE_LABEL[row.stage]}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-medium text-[#0F172A]">{row.amount != null ? `£${row.amount.toLocaleString("en-GB")}` : "—"}</span>
                    <span className="text-sm font-semibold text-[#16A34A]">{row.expectedRevenue != null ? `£${row.expectedRevenue.toLocaleString("en-GB")}` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                    {row.ownerName && <span className="text-[11px] text-[#94A3B8]">{row.ownerName}</span>}
                  </div>
                </Link>
              ))}
            </div>

            {/* Tablet/Desktop: table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs text-[#94A3B8] uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Opportunity</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Company</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Contact</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Priority</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Probability</th>
                  <th className="px-5 py-3 font-medium">Exp. Revenue</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Owner</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Close Date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F8FAFC]">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-[#F8FAFC] transition">
                    <td className="px-5 py-3.5">
                      <Link href={`/opportunities/${row.id}`} className="font-medium text-[#0F172A] hover:text-[#0F4C81] transition">
                        {row.opportunityName}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-[#475569] hidden md:table-cell">{row.companyName}</td>
                    <td className="px-5 py-3.5 text-[#475569] hidden lg:table-cell">{row.contactName ?? "—"}</td>
                    <td className="px-5 py-3.5"><Badge variant="blue">{STAGE_LABEL[row.stage]}</Badge></td>
                    <td className="px-5 py-3.5 hidden lg:table-cell"><Badge variant={PRIORITY_VARIANT[row.priority]}>{row.priority}</Badge></td>
                    <td className="px-5 py-3.5 text-sm font-medium text-[#0F172A]">{row.amount != null ? `£${row.amount.toLocaleString("en-GB")}` : "—"}</td>
                    <td className="px-5 py-3.5 text-[#475569] text-xs hidden lg:table-cell">{row.probability != null ? `${Math.round(row.probability * 100)}%` : "—"}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-[#16A34A]">{row.expectedRevenue != null ? `£${row.expectedRevenue.toLocaleString("en-GB")}` : "—"}</td>
                    <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">{row.ownerName ?? "—"}</td>
                    <td className="px-5 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">{row.expectedCloseDate ? new Date(row.expectedCloseDate).toLocaleDateString() : "—"}</td>
                    <td className="px-5 py-3.5"><Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#00B8D9] transition shrink-0 min-h-[40px]"
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
