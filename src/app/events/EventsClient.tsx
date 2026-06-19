"use client";

import { useState } from "react";
import { Plus, CalendarDays, MapPin, RefreshCw } from "lucide-react";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Event } from "@/db/schema";

const STATUS_COLORS: Record<string, "green" | "blue" | "gray" | "red"> = {
  active: "green", upcoming: "blue", completed: "gray", cancelled: "red",
};

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
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <EmptyState
            icon={CalendarDays}
            title="No events yet"
            description="Create your first event to start capturing leads."
            action={canCreate ? (
              <button onClick={() => setShowCreate(true)} className="text-sm text-indigo-400 hover:text-indigo-300">
                Create event →
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((ev) => (
            <div key={ev.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white leading-tight">{ev.name}</h3>
                <Badge variant={STATUS_COLORS[ev.status] ?? "gray"}>{ev.status}</Badge>
              </div>
              {ev.location && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {ev.location}
                </div>
              )}
              {(ev.startDate || ev.endDate) && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  {ev.startDate ?? "—"} → {ev.endDate ?? "—"}
                </div>
              )}
              <div className="pt-1">
                <p className="text-[10px] font-mono text-gray-600">/{ev.slug}</p>
              </div>
            </div>
          ))}
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name) { setError("Event name is required"); return; }
    setLoading(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}
      <Button type="submit" loading={loading} className="w-full">Create Event</Button>
    </form>
  );
}
