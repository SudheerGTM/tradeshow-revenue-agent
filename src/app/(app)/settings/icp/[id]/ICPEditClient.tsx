"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, Save, Copy, CheckCircle2, PauseCircle, Star, FlaskConical,
  Building2, Users, MessageSquare, TrendingUp, Package, Plus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { TagListField } from "@/components/icp/TagListField";
import type { IcpProfile, IcpStatus } from "@/db/schema";
import type { ICPConfig, ICPProduct } from "@/lib/icp/schema";

const STATUS_BADGE: Record<IcpStatus, "gray" | "green" | "yellow"> = { draft: "yellow", active: "green", inactive: "gray" };

function emptyProduct(): ICPProduct {
  return { name: "", description: "", targetPersonas: [], painPointsAddressed: [], useCases: [], keywords: [], valueProposition: "", typicalDealValue: null };
}

function Section({ icon: Icon, title, defaultOpen, children }: { icon: React.ComponentType<{ className?: string }>; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-4"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-[#0F172A]">
          <Icon className="w-4 h-4 text-[#0F4C81]" /> {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#94A3B8] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 sm:px-6 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

export function ICPEditClient({ profile, config: initialConfig, isDefault: initialIsDefault }: {
  profile: IcpProfile;
  config: ICPConfig;
  isDefault: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [config, setConfig] = useState<ICPConfig>(initialConfig);
  const [status, setStatus] = useState(profile.status);
  const [version, setVersion] = useState(profile.version);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function updateSection<K extends keyof ICPConfig>(key: K, value: ICPConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/icp-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, configurationJson: config }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      const updated = await res.json();
      setVersion(updated.version);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setBusy("status");
    const endpoint = status === "active" ? "deactivate" : "activate";
    try {
      const res = await fetch(`/api/icp-profiles/${profile.id}/${endpoint}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const updated = await res.json();
      setStatus(updated.status);
      if (endpoint === "deactivate" && isDefault) setIsDefault(false);
      toast.success(endpoint === "activate" ? "Activated" : "Deactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  async function setDefault(next: boolean) {
    setBusy("default");
    try {
      const res = await fetch("/api/icp-profiles/default", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icpProfileId: next ? profile.id : null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update default");
      setIsDefault(next);
      toast.success(next ? "Set as tenant default" : "Default cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function clone() {
    setBusy("clone");
    try {
      const res = await fetch(`/api/icp-profiles/${profile.id}/clone`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to clone");
      const cloned = await res.json();
      toast.success(`Cloned as "${cloned.name}"`);
      router.push(`/settings/icp/${cloned.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clone");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header actions */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
          {isDefault && <Badge variant="turquoise" className="gap-1"><Star className="w-3 h-3" /> Tenant Default</Badge>}
          <span className="text-xs text-[#94A3B8]">v{version}</span>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={clone} disabled={!!busy} loading={busy === "clone"}>
            <Copy className="w-3.5 h-3.5" /> Clone
          </Button>
          <Button size="sm" variant="secondary" onClick={toggleActive} disabled={!!busy} loading={busy === "status"}>
            {status === "active" ? <><PauseCircle className="w-3.5 h-3.5" /> Deactivate</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Activate</>}
          </Button>
          {status === "active" && (
            <Button size="sm" variant="ghost" onClick={() => setDefault(!isDefault)} disabled={!!busy} loading={busy === "default"}>
              {isDefault ? "Clear Default" : "Set as Default"}
            </Button>
          )}
          <Button size="sm" onClick={save} loading={saving}>
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
        </div>
      </div>

      <Section icon={Building2} title="Company Fit" defaultOpen>
        <TagListField label="Target industries" values={config.companyFit.targetIndustries} onChange={(v) => updateSection("companyFit", { ...config.companyFit, targetIndustries: v })} />
        <TagListField label="Sub-industries" values={config.companyFit.targetSubindustries} onChange={(v) => updateSection("companyFit", { ...config.companyFit, targetSubindustries: v })} />
        <TagListField label="Target countries / regions" values={config.companyFit.targetCountries} onChange={(v) => updateSection("companyFit", { ...config.companyFit, targetCountries: v })} />
        <div className="grid grid-cols-2 gap-4">
          <Input type="number" label="Min employees" value={config.companyFit.employeeSizeMin ?? ""} onChange={(e) => updateSection("companyFit", { ...config.companyFit, employeeSizeMin: e.target.value ? Number(e.target.value) : null })} />
          <Input type="number" label="Max employees" value={config.companyFit.employeeSizeMax ?? ""} onChange={(e) => updateSection("companyFit", { ...config.companyFit, employeeSizeMax: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input type="number" label="Min revenue" value={config.companyFit.revenueRangeMin ?? ""} onChange={(e) => updateSection("companyFit", { ...config.companyFit, revenueRangeMin: e.target.value ? Number(e.target.value) : null })} />
          <Input type="number" label="Max revenue" value={config.companyFit.revenueRangeMax ?? ""} onChange={(e) => updateSection("companyFit", { ...config.companyFit, revenueRangeMax: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <TagListField label="Company types" values={config.companyFit.companyTypes} onChange={(v) => updateSection("companyFit", { ...config.companyFit, companyTypes: v })} />
        <TagListField label="Relevant technologies" values={config.companyFit.relevantTechnologies} onChange={(v) => updateSection("companyFit", { ...config.companyFit, relevantTechnologies: v })} />
        <TagListField label="Excluded industries" values={config.companyFit.excludedIndustries} onChange={(v) => updateSection("companyFit", { ...config.companyFit, excludedIndustries: v })} />
        <TagListField label="Excluded company types" values={config.companyFit.excludedCompanyTypes} onChange={(v) => updateSection("companyFit", { ...config.companyFit, excludedCompanyTypes: v })} />
        <TagListField label="Other exclusions (e.g. competitors)" values={config.companyFit.exclusions} onChange={(v) => updateSection("companyFit", { ...config.companyFit, exclusions: v })} />
      </Section>

      <Section icon={Users} title="Persona Fit">
        <TagListField label="Target departments" values={config.personaFit.targetDepartments} onChange={(v) => updateSection("personaFit", { ...config.personaFit, targetDepartments: v })} />
        <TagListField label="Target job functions" values={config.personaFit.targetJobFunctions} onChange={(v) => updateSection("personaFit", { ...config.personaFit, targetJobFunctions: v })} />
        <TagListField label="Target titles" values={config.personaFit.targetTitles} onChange={(v) => updateSection("personaFit", { ...config.personaFit, targetTitles: v })} />
        <TagListField label="Target seniority" values={config.personaFit.targetSeniority} onChange={(v) => updateSection("personaFit", { ...config.personaFit, targetSeniority: v })} />
        <TagListField label="Decision maker titles" values={config.personaFit.decisionMakerTitles} onChange={(v) => updateSection("personaFit", { ...config.personaFit, decisionMakerTitles: v })} />
        <TagListField label="Economic buyer titles" values={config.personaFit.economicBuyerTitles} onChange={(v) => updateSection("personaFit", { ...config.personaFit, economicBuyerTitles: v })} />
        <TagListField label="Influencer titles" values={config.personaFit.influencerTitles} onChange={(v) => updateSection("personaFit", { ...config.personaFit, influencerTitles: v })} />
        <TagListField label="Champion titles" values={config.personaFit.championTitles} onChange={(v) => updateSection("personaFit", { ...config.personaFit, championTitles: v })} />
        <TagListField label="Non-target personas" values={config.personaFit.nonTargetPersonas} onChange={(v) => updateSection("personaFit", { ...config.personaFit, nonTargetPersonas: v })} />
      </Section>

      <Section icon={MessageSquare} title="Problem Fit">
        <TagListField label="Priority pain points" values={config.problemFit.priorityPainPoints} onChange={(v) => updateSection("problemFit", { ...config.problemFit, priorityPainPoints: v })} />
        <TagListField label="Business challenges" values={config.problemFit.businessChallenges} onChange={(v) => updateSection("problemFit", { ...config.problemFit, businessChallenges: v })} />
        <TagListField label="Business objectives" values={config.problemFit.businessObjectives} onChange={(v) => updateSection("problemFit", { ...config.problemFit, businessObjectives: v })} />
        <TagListField label="Priority use cases" values={config.problemFit.priorityUseCases} onChange={(v) => updateSection("problemFit", { ...config.problemFit, priorityUseCases: v })} />
        <TagListField label="Trigger events" values={config.problemFit.triggerEvents} onChange={(v) => updateSection("problemFit", { ...config.problemFit, triggerEvents: v })} />
      </Section>

      <Section icon={TrendingUp} title="Buying Signals">
        <TagListField label="High-intent signals" values={config.buyingSignals.high} onChange={(v) => updateSection("buyingSignals", { ...config.buyingSignals, high: v })} />
        <TagListField label="Medium-intent signals" values={config.buyingSignals.medium} onChange={(v) => updateSection("buyingSignals", { ...config.buyingSignals, medium: v })} />
        <TagListField label="Negative signals" values={config.buyingSignals.negative} onChange={(v) => updateSection("buyingSignals", { ...config.buyingSignals, negative: v })} />
      </Section>

      <Section icon={Package} title="Products / Solutions">
        <div className="space-y-4">
          {config.products.map((product, i) => (
            <div key={i} className="border border-[#E2E8F0] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Input placeholder="Product name" value={product.name} onChange={(e) => {
                  const next = [...config.products]; next[i] = { ...product, name: e.target.value }; updateSection("products", next);
                }} className="flex-1" />
                <button type="button" onClick={() => updateSection("products", config.products.filter((_, idx) => idx !== i))} className="text-[#94A3B8] hover:text-[#DC2626] shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Textarea placeholder="Description" value={product.description} onChange={(e) => {
                const next = [...config.products]; next[i] = { ...product, description: e.target.value }; updateSection("products", next);
              }} />
              <TagListField label="Target personas" values={product.targetPersonas} onChange={(v) => { const next = [...config.products]; next[i] = { ...product, targetPersonas: v }; updateSection("products", next); }} />
              <TagListField label="Pain points addressed" values={product.painPointsAddressed} onChange={(v) => { const next = [...config.products]; next[i] = { ...product, painPointsAddressed: v }; updateSection("products", next); }} />
              <TagListField label="Use cases" values={product.useCases} onChange={(v) => { const next = [...config.products]; next[i] = { ...product, useCases: v }; updateSection("products", next); }} />
              <TagListField label="Keywords" values={product.keywords} onChange={(v) => { const next = [...config.products]; next[i] = { ...product, keywords: v }; updateSection("products", next); }} />
              <div className="grid grid-cols-2 gap-4">
                <Input placeholder="Value proposition" value={product.valueProposition} onChange={(e) => { const next = [...config.products]; next[i] = { ...product, valueProposition: e.target.value }; updateSection("products", next); }} />
                <Input type="number" placeholder="Typical deal value" value={product.typicalDealValue ?? ""} onChange={(e) => { const next = [...config.products]; next[i] = { ...product, typicalDealValue: e.target.value ? Number(e.target.value) : null }; updateSection("products", next); }} />
              </div>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => updateSection("products", [...config.products, emptyProduct()])}>
            <Plus className="w-3.5 h-3.5" /> Add Product
          </Button>
        </div>
      </Section>

      <TestModePanel profileId={profile.id} />
    </div>
  );
}

// ─── ICP Test Mode ──────────────────────────────────────────────────────────
// Simulation only — see src/app/api/icp-profiles/[id]/test/route.ts and
// src/lib/icp/fit.ts. Qualitative criteria only, no numeric score.

const RESULT_ICON: Record<string, string> = { matched: "✓", missing: "✗", negative: "✗", unknown: "△" };
const RESULT_COLOR: Record<string, string> = { matched: "#16A34A", missing: "#94A3B8", negative: "#DC2626", unknown: "#94A3B8" };
const OVERALL_BADGE: Record<string, "green" | "yellow" | "red" | "gray"> = { Strong: "green", Moderate: "yellow", Weak: "red", Unknown: "gray" };

function TestModePanel({ profileId }: { profileId: string }) {
  const toast = useToast();
  const [sample, setSample] = useState({ companyName: "", industry: "", country: "", employeeCount: "", jobTitle: "", notes: "" });
  const [result, setResult] = useState<{ overall: string; criteria: { label: string; result: string; detail?: string }[] } | null>(null);
  const [running, setRunning] = useState(false);

  async function runTest() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/icp-profiles/${profileId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sample,
          employeeCount: sample.employeeCount ? Number(sample.employeeCount) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Test failed");
      setResult(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section icon={FlaskConical} title="Test This ICP">
      <p className="text-xs text-[#94A3B8]">
        Simulation only — provides a qualitative criteria preview. Creates no lead, calls no external service, and is not audited.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Company name" value={sample.companyName} onChange={(e) => setSample({ ...sample, companyName: e.target.value })} />
        <Input label="Industry" value={sample.industry} onChange={(e) => setSample({ ...sample, industry: e.target.value })} />
        <Input label="Country" value={sample.country} onChange={(e) => setSample({ ...sample, country: e.target.value })} />
        <Input type="number" label="Employee count" value={sample.employeeCount} onChange={(e) => setSample({ ...sample, employeeCount: e.target.value })} />
        <Input label="Job title" value={sample.jobTitle} onChange={(e) => setSample({ ...sample, jobTitle: e.target.value })} />
      </div>
      <Textarea label="Conversation notes / free text" value={sample.notes} onChange={(e) => setSample({ ...sample, notes: e.target.value })} />
      <Button onClick={runTest} loading={running}>
        <FlaskConical className="w-3.5 h-3.5" /> Run Test
      </Button>

      {result && (
        <div className="mt-4 border border-[#E2E8F0] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#0F172A]">ICP Match:</span>
            <Badge variant={OVERALL_BADGE[result.overall] ?? "gray"}>{result.overall}</Badge>
          </div>
          <ul className="space-y-1">
            {result.criteria.map((c, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span style={{ color: RESULT_COLOR[c.result] }} className="font-semibold w-4 shrink-0">{RESULT_ICON[c.result]}</span>
                <span className="text-[#475569]">
                  {c.label}
                  {c.result === "unknown" && " (not enough data / not configured)"}
                  {c.detail && c.result !== "unknown" && <span className="text-[#94A3B8]"> — {c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
