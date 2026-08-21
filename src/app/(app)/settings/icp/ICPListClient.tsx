"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star, Copy, CheckCircle2, PauseCircle, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { IcpProfile, IcpStatus } from "@/db/schema";

const STATUS_BADGE: Record<IcpStatus, "gray" | "green" | "yellow"> = {
  draft: "yellow",
  active: "green",
  inactive: "gray",
};

export function ICPListClient({
  initialProfiles,
  defaultIcpProfileId,
}: {
  initialProfiles: IcpProfile[];
  defaultIcpProfileId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [defaultId, setDefaultId] = useState(defaultIcpProfileId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function createProfile() {
    if (!newName.trim()) return;
    setBusy("create");
    try {
      const res = await fetch("/api/icp-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create");
      const created = await res.json();
      toast.success("ICP profile created — draft");
      router.push(`/settings/icp/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create ICP profile");
    } finally {
      setBusy(null);
      setCreating(false);
    }
  }

  async function clone(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/icp-profiles/${id}/clone`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to clone");
      const cloned = await res.json();
      setProfiles((prev) => [cloned, ...prev]);
      toast.success(`Cloned as "${cloned.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clone");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(profile: IcpProfile) {
    setBusy(profile.id);
    const endpoint = profile.status === "active" ? "deactivate" : "activate";
    try {
      const res = await fetch(`/api/icp-profiles/${profile.id}/${endpoint}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const updated = await res.json();
      setProfiles((prev) => prev.map((p) => (p.id === profile.id ? updated : p)));
      if (endpoint === "deactivate" && defaultId === profile.id) setDefaultId(null);
      toast.success(endpoint === "activate" ? "Activated" : "Deactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  async function setDefault(id: string | null) {
    setBusy(id ?? "clear-default");
    try {
      const res = await fetch("/api/icp-profiles/default", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icpProfileId: id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to set default");
      setDefaultId(id);
      toast.success(id ? "Set as tenant default" : "Default cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set default");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> New ICP Profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No ICP profiles yet"
          description="Create your first Ideal Customer Profile to start configuring who this tenant targets."
        />
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm divide-y divide-[#F1F5F9]">
          {profiles.map((p) => (
            <div key={p.id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/settings/icp/${p.id}`} className="text-sm font-semibold text-[#0F172A] hover:text-[#00B8D9] truncate">
                    {p.name}
                  </Link>
                  <Badge variant={STATUS_BADGE[p.status]}>{p.status}</Badge>
                  {defaultId === p.id && (
                    <Badge variant="turquoise" className="gap-1">
                      <Star className="w-3 h-3" /> Default
                    </Badge>
                  )}
                  <span className="text-xs text-[#94A3B8]">v{p.version}</span>
                </div>
                {p.description && <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{p.description}</p>}
                <p className="text-xs text-[#94A3B8] mt-0.5">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => clone(p.id)} disabled={busy === p.id}>
                  <Copy className="w-3.5 h-3.5" /> Clone
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleActive(p)}
                  disabled={busy === p.id}
                  loading={busy === p.id}
                >
                  {p.status === "active" ? <><PauseCircle className="w-3.5 h-3.5" /> Deactivate</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Activate</>}
                </Button>
                {p.status === "active" && defaultId !== p.id && (
                  <Button size="sm" variant="ghost" onClick={() => setDefault(p.id)} disabled={busy === p.id}>
                    Set as Default
                  </Button>
                )}
                {defaultId === p.id && (
                  <Button size="sm" variant="ghost" onClick={() => setDefault(null)} disabled={busy === p.id}>
                    Clear Default
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[#94A3B8]">
        A tenant can have several <Badge variant="green" className="mx-0.5">active</Badge> ICP profiles at once — different events can target different audiences.
        The <Badge variant="turquoise" className="mx-0.5">Default</Badge> is the one used when an event doesn&apos;t explicitly select one.
      </p>

      <Modal open={creating} onClose={() => setCreating(false)} title="New ICP Profile">
        <div className="space-y-4">
          <Input label="Name" placeholder="e.g. Enterprise HR" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Textarea label="Description (optional)" placeholder="Short internal description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={createProfile} disabled={!newName.trim()} loading={busy === "create"}>Create Draft</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
