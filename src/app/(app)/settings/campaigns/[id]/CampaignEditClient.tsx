"use client";

import { useState } from "react";
import Link from "next/link";
import { Beaker, Target, CalendarDays, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { Campaign, IcpProfile } from "@/db/schema";

const STATUS_BADGE: Record<string, "gray" | "green" | "yellow" | "blue"> = {
  draft: "yellow", active: "green", completed: "blue", archived: "gray",
};

type TestResult = {
  primaryMatch: { profileId: string; profileName: string; overall: string } | null;
  otherMatches: { profileId: string; profileName: string; overall: string }[];
  noMatch: { profileId: string; profileName: string; overall: string }[];
};

export function CampaignEditClient({
  campaign, assignedIcpProfileIds, allIcpProfiles, allEvents,
}: {
  campaign: Campaign;
  assignedIcpProfileIds: string[];
  allIcpProfiles: IcpProfile[];
  allEvents: { id: string; name: string; campaignId: string | null }[];
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: campaign.name, description: campaign.description ?? "",
    startDate: campaign.startDate ?? "", endDate: campaign.endDate ?? "",
  });
  const [status, setStatus] = useState(campaign.status);
  const [icpIds, setIcpIds] = useState<string[]>(assignedIcpProfileIds);
  const [eventIds, setEventIds] = useState<string[]>(allEvents.filter((e) => e.campaignId === campaign.id).map((e) => e.id));
  const [saving, setSaving] = useState(false);
  const [savingIcps, setSavingIcps] = useState(false);
  const [savingEvents, setSavingEvents] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(), description: form.description.trim() || null,
          startDate: form.startDate || null, endDate: form.endDate || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    setStatusBusy(true);
    const endpoint = status === "active" ? "archive" : "activate";
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/${endpoint}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const updated = await res.json();
      setStatus(updated.status);
      toast.success(endpoint === "activate" ? "Activated" : "Archived");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  function toggleIcp(id: string) {
    setIcpIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleEvent(id: string) {
    setEventIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // No bulk-assignment endpoint exists — each event's campaignId is set
  // individually via the same PATCH /api/events/:id the Edit Event form
  // uses. Only events whose membership actually changed are touched.
  async function saveEvents() {
    setSavingEvents(true);
    const originalIds = new Set(allEvents.filter((e) => e.campaignId === campaign.id).map((e) => e.id));
    const nextIds = new Set(eventIds);
    const changed = allEvents.filter((e) => originalIds.has(e.id) !== nextIds.has(e.id));
    try {
      const results = await Promise.all(changed.map((ev) =>
        fetch(`/api/events/${ev.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: nextIds.has(ev.id) ? campaign.id : null }),
        })
      ));
      if (results.some((r) => !r.ok)) throw new Error("Some events failed to update");
      toast.success("Associated events saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save associated events");
    } finally {
      setSavingEvents(false);
    }
  }

  async function saveIcps() {
    setSavingIcps(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/icps`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icpProfileIds: icpIds }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      toast.success("Target ICPs saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save target ICPs");
    } finally {
      setSavingIcps(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/settings/campaigns" className="text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium">← Back to Campaigns</Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-lg font-semibold text-[#0F172A]">{campaign.name}</h1>
          <Badge variant={STATUS_BADGE[status] ?? "gray"}>{status}</Badge>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#0F172A]">Details</p>
          <Button size="sm" variant={status === "active" ? "secondary" : "primary"} onClick={toggleStatus} loading={statusBusy}>
            {status === "active" ? "Archive Campaign" : "Activate Campaign"}
          </Button>
        </div>
        <Input label="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <Textarea label="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start Date" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
          <Input label="End Date" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
        </div>
        <Button onClick={save} loading={saving}><Save className="w-4 h-4" /> Save</Button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[#0F4C81]" />
          <p className="text-sm font-semibold text-[#0F172A]">Target ICPs</p>
        </div>
        {allIcpProfiles.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No ICP profiles exist yet — create one in ICP Configuration first.</p>
        ) : (
          <>
            <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#F1F5F9]">
              {allIcpProfiles.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#0F172A] cursor-pointer hover:bg-[#F8FAFC]">
                  <input type="checkbox" checked={icpIds.includes(p.id)} onChange={() => toggleIcp(p.id)}
                    className="rounded border-[#CBD5E1] text-[#00B8D9] focus:ring-[#00B8D9]" />
                  {p.name}
                  {p.status !== "active" && <span className="text-[10px] text-[#94A3B8]">({p.status})</span>}
                </label>
              ))}
            </div>
            <p className="text-xs text-[#94A3B8]">A prospect may match any selected ICP.</p>
            <Button size="sm" onClick={saveIcps} loading={savingIcps}>Save Target ICPs</Button>
          </>
        )}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#0F4C81]" />
          <p className="text-sm font-semibold text-[#0F172A]">Associated Events</p>
        </div>
        {allEvents.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No events exist yet — create one on the Events page first.</p>
        ) : (
          <>
            <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#F1F5F9]">
              {allEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <label className="flex items-center gap-2.5 text-sm text-[#0F172A] cursor-pointer flex-1">
                    <input type="checkbox" checked={eventIds.includes(ev.id)} onChange={() => toggleEvent(ev.id)}
                      className="rounded border-[#CBD5E1] text-[#00B8D9] focus:ring-[#00B8D9]" />
                    {ev.name}
                    {ev.campaignId && ev.campaignId !== campaign.id && (
                      <span className="text-[10px] text-[#94A3B8]">(on another campaign)</span>
                    )}
                  </label>
                  <Link href={`/events/${ev.id}/report`} className="text-xs text-[#00B8D9] hover:text-[#009ab8] shrink-0">Report →</Link>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#94A3B8]">Selecting an event here moves it onto this Campaign (an event belongs to at most one Campaign at a time).</p>
            <Button size="sm" onClick={saveEvents} loading={savingEvents}>Save Associated Events</Button>
          </>
        )}
      </div>

      <CampaignTestPanel campaignId={campaign.id} hasIcps={icpIds.length > 0} />
    </div>
  );
}

function CampaignTestPanel({ campaignId, hasIcps }: { campaignId: string; hasIcps: boolean }) {
  const [sample, setSample] = useState({ companyName: "", industry: "", country: "", employeeCount: "", jobTitle: "", notes: "" });
  const [result, setResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  async function runTest() {
    setTesting(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: sample.companyName || undefined,
          industry: sample.industry || undefined,
          country: sample.country || undefined,
          employeeCount: sample.employeeCount ? Number(sample.employeeCount) : undefined,
          jobTitle: sample.jobTitle || undefined,
          notes: sample.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Beaker className="w-4 h-4 text-[#0F4C81]" />
        <p className="text-sm font-semibold text-[#0F172A]">Test This Campaign</p>
      </div>
      <p className="text-xs text-[#94A3B8]">
        Simulation only — evaluates each target ICP independently. Creates no lead, calls no external service, and is not audited.
      </p>
      {!hasIcps ? (
        <p className="text-xs text-[#94A3B8]">Assign at least one target ICP above to test this campaign.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Company name" value={sample.companyName} onChange={(e) => setSample((p) => ({ ...p, companyName: e.target.value }))} />
            <Input label="Industry" value={sample.industry} onChange={(e) => setSample((p) => ({ ...p, industry: e.target.value }))} />
            <Input label="Country" value={sample.country} onChange={(e) => setSample((p) => ({ ...p, country: e.target.value }))} />
            <Input label="Employee count" type="number" value={sample.employeeCount} onChange={(e) => setSample((p) => ({ ...p, employeeCount: e.target.value }))} />
            <Input label="Job title" value={sample.jobTitle} onChange={(e) => setSample((p) => ({ ...p, jobTitle: e.target.value }))} />
          </div>
          <Textarea label="Conversation notes / free text" value={sample.notes} onChange={(e) => setSample((p) => ({ ...p, notes: e.target.value }))} />
          <Button size="sm" onClick={runTest} loading={testing}><Beaker className="w-3.5 h-3.5" /> Run Test</Button>

          {error && <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>}

          {result && (
            <div className="border border-[#E2E8F0] rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider">Campaign Match</p>
              {result.primaryMatch ? (
                <p className="text-sm text-[#0F172A]">
                  Primary Match — <span className="font-medium">{result.primaryMatch.profileName}</span> ({result.primaryMatch.overall})
                </p>
              ) : (
                <p className="text-sm text-[#94A3B8]">No strong match found among target ICPs.</p>
              )}
              {result.otherMatches.length > 0 && (
                <div>
                  <p className="text-xs text-[#94A3B8]">Other Matches</p>
                  {result.otherMatches.map((m) => (
                    <p key={m.profileId} className="text-sm text-[#0F172A]">{m.profileName} ({m.overall})</p>
                  ))}
                </div>
              )}
              {result.noMatch.length > 0 && (
                <div>
                  <p className="text-xs text-[#94A3B8]">No Match</p>
                  {result.noMatch.map((m) => (
                    <p key={m.profileId} className="text-sm text-[#94A3B8]">{m.profileName} ({m.overall})</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
