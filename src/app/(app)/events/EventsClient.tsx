"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, CalendarDays, MapPin, DollarSign, BarChart3, FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getEventDisplayStatus } from "@/lib/event-status";
import type { Event, IcpProfile } from "@/db/schema";

export function EventsClient({ initial, canCreate }: { initial: Event[]; canCreate: boolean }) {
  const [events, setEvents] = useState<Event[]>(initial);
  const [showCreate, setShowCreate] = useState(false);

  function onCreated(ev: Event) {
    setEvents((p) => [ev, ...p]);
    setShowCreate(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Trade shows and exhibitions for your organisation"
        action={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> New Event
            </Button>
          ) : null
        }
      />

      {events.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm">
          <EmptyState
            icon={CalendarDays}
            title="No events yet"
            description="Create your first event to start capturing leads."
            action={canCreate ? (
              <button onClick={() => setShowCreate(true)} className="text-sm text-[#00B8D9] hover:text-[#009ab8] font-medium">
                Create event →
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((ev) => {
            const displayStatus = getEventDisplayStatus(ev);
            return (
            <div key={ev.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0F172A] leading-tight">{ev.name}</h3>
                <Badge variant={displayStatus.color}>{displayStatus.label}</Badge>
              </div>
              {ev.location && (
                <div className="flex items-center gap-1.5 text-xs text-[#475569]">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {ev.location}
                </div>
              )}
              {(ev.startDate || ev.endDate) && (
                <div className="flex items-center gap-1.5 text-xs text-[#475569]">
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  {ev.startDate ?? "—"} → {ev.endDate ?? "—"}
                </div>
              )}
              <p className="text-[10px] font-mono text-[#CBD5E1]">/{ev.slug}</p>

              <div className="flex items-center gap-3 pt-2 border-t border-[#F1F5F9]">
                <Link href={`/events/${ev.id}/costs`} className="flex items-center gap-1 text-xs text-[#475569] hover:text-[#0F4C81] transition">
                  <DollarSign className="w-3.5 h-3.5" /> Costs
                </Link>
                <Link href={`/analytics/event/${ev.id}`} className="flex items-center gap-1 text-xs text-[#475569] hover:text-[#0F4C81] transition">
                  <BarChart3 className="w-3.5 h-3.5" /> ROI
                </Link>
                <Link href={`/events/${ev.id}/report`} className="flex items-center gap-1 text-xs text-[#475569] hover:text-[#0F4C81] transition">
                  <FileText className="w-3.5 h-3.5" /> Report
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {canCreate && (
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Event">
          <CreateEventForm onCreated={onCreated} />
        </Modal>
      )}
    </div>
  );
}

function CreateEventForm({ onCreated }: { onCreated: (ev: Event) => void }) {
  const [form, setForm] = useState({ name: "", location: "", startDate: "", endDate: "" });
  const [icpProfileIds, setIcpProfileIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [icpProfiles, setIcpProfiles] = useState<IcpProfile[]>([]);

  // Best-effort — a booth_user/manager creating an event won't have access
  // to /api/icp-profiles beyond the list read, and a 403 here shouldn't
  // block event creation, just leave the ICP picker empty (falls back to
  // the tenant's default ICP, or no ICP context, same as before).
  useEffect(() => {
    fetch("/api/icp-profiles")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setIcpProfiles((d.items ?? []).filter((p: IcpProfile) => p.status === "active")))
      .catch(() => {});
  }, []);

  function toggleIcp(id: string) {
    setIcpProfileIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name) { setError("Event name is required"); return; }
    setLoading(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, icpProfileIds }),
    });
    setLoading(false);
    if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
    onCreated(await res.json());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Event Name *" value={form.name}
        onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
        placeholder="Multimodal 2026" />
      <Input label="Location" value={form.location}
        onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))}
        placeholder="Birmingham, UK" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Start Date" type="date" value={form.startDate}
          onChange={(e) => setForm(p => ({ ...p, startDate: e.target.value }))} />
        <Input label="End Date" type="date" value={form.endDate}
          onChange={(e) => setForm(p => ({ ...p, endDate: e.target.value }))} />
      </div>
      {icpProfiles.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1.5">Target ICPs</label>
          <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#F1F5F9]">
            {icpProfiles.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#0F172A] cursor-pointer hover:bg-[#F8FAFC]">
                <input type="checkbox" checked={icpProfileIds.includes(p.id)} onChange={() => toggleIcp(p.id)}
                  className="rounded border-[#CBD5E1] text-[#00B8D9] focus:ring-[#00B8D9]" />
                {p.name}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-1.5">
            {icpProfileIds.length === 0
              ? "None selected — this event will use the tenant's default ICP."
              : "A lead may match any selected ICP."}
          </p>
        </div>
      )}
      {error && (
        <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>
      )}
      <Button type="submit" loading={loading} className="w-full">Create Event</Button>
    </form>
  );
}
