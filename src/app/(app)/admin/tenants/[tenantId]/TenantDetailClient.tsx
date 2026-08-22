"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Users, Target, Plug, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge, statusBadge } from "@/components/ui/Badge";
import { getEventDisplayStatus } from "@/lib/event-status";
import type { PlanLimits } from "@/lib/plans";
import type { Tenant } from "@/db/schema";

export interface TenantDetailData {
  tenant: Tenant;
  plan: PlanLimits;
  tenantAdmin: { name: string; email: string } | null;
  lastActivityAt: string | null;
  adoption: {
    totalUsers: number; activeUsers: number; leadsCaptured: number; qualifiedLeads: number;
    opportunities: number; pipelineValue: number; expectedRevenue: number;
  };
  events: {
    id: string; name: string; startDate: string | null; endDate: string | null; status: string;
    assignedIcpCount: number; campaignName: string | null;
  }[];
  targeting: {
    defaultIcpName: string | null; icpProfileCount: number; activeIcpProfileCount: number; campaignCount: number;
  };
  integrations: { name: string; connected: boolean }[];
}

function fmtGBP(n: number) { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

export function TenantDetailClient({ data }: { data: TenantDetailData }) {
  const [tenant, setTenant] = useState(data.tenant);
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    const newStatus = tenant.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/tenants/${tenant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setTenant(await res.json());
    setToggling(false);
  }

  return (
    <div className="space-y-6 text-gray-100">
      <Link href="/admin/tenants" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Tenants
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{tenant.name}</h1>
            <p className="text-xs text-gray-500 font-mono">{tenant.slug} · {tenant.subdomain}</p>
          </div>
        </div>
        <Badge variant={statusBadge(tenant.status)}>{tenant.status}</Badge>
      </div>

      {/* Tenant Overview */}
      <Section title="Overview" icon={Building2}>
        <Grid>
          <Field label="Tenant Name" value={tenant.name} />
          <Field label="Slug" value={tenant.slug} mono />
          <Field label="Subdomain" value={tenant.subdomain} mono />
          <Field label="Status" value={tenant.status} />
          <Field label="Created" value={new Date(tenant.createdAt).toLocaleDateString()} />
          <Field label="Plan" value={data.plan.label} />
          <Field label="Tenant Admin" value={data.tenantAdmin ? `${data.tenantAdmin.name} (${data.tenantAdmin.email})` : "— none invited yet"} />
          <Field label="Last Activity" value={data.lastActivityAt ? new Date(data.lastActivityAt).toLocaleString() : "No activity yet"} />
        </Grid>
      </Section>

      {/* Adoption */}
      <Section title="Adoption" icon={Users}>
        <Grid cols={4}>
          <Stat label="Total Users" value={data.adoption.totalUsers} />
          <Stat label="Active Users" value={data.adoption.activeUsers} />
          <Stat label="Leads Captured" value={data.adoption.leadsCaptured} />
          <Stat label="Qualified Leads" value={data.adoption.qualifiedLeads} />
          <Stat label="Opportunities" value={data.adoption.opportunities} />
          <Stat label="Pipeline Value" value={fmtGBP(data.adoption.pipelineValue)} />
          <Stat label="Expected Revenue" value={fmtGBP(data.adoption.expectedRevenue)} />
        </Grid>
      </Section>

      {/* Events */}
      <Section title="Events" icon={Target}>
        {data.events.length === 0 ? (
          <p className="text-sm text-gray-500">No events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 pr-4 font-medium">Start</th>
                  <th className="py-2 pr-4 font-medium">End</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">ICPs</th>
                  <th className="py-2 pr-4 font-medium">Campaign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.events.map((ev) => {
                  const s = getEventDisplayStatus(ev);
                  return (
                    <tr key={ev.id}>
                      <td className="py-2.5 pr-4 text-white">{ev.name}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{ev.startDate ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{ev.endDate ?? "—"}</td>
                      <td className="py-2.5 pr-4"><Badge variant={s.color}>{s.label}</Badge></td>
                      <td className="py-2.5 pr-4 text-gray-400">{ev.assignedIcpCount}</td>
                      <td className="py-2.5 pr-4 text-gray-500">{ev.campaignName ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Targeting */}
      <Section title="Targeting" icon={Target}>
        <Grid>
          <Field label="Tenant Default ICP" value={data.targeting.defaultIcpName ?? "— none set"} />
          <Field label="ICP Profiles" value={`${data.targeting.icpProfileCount} total (${data.targeting.activeIcpProfileCount} active)`} />
          <Field label="Campaigns" value={`${data.targeting.campaignCount}`} />
        </Grid>
      </Section>

      {/* Integrations */}
      <Section title="Integrations" icon={Plug}>
        <p className="text-xs text-gray-500 mb-3">
          These are platform-wide credentials, not per-tenant — every tenant currently sees the same connected/disconnected state.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.integrations.map((i) => (
            <span key={i.name} className={`text-xs font-medium px-2.5 py-1 rounded-lg ${i.connected ? "bg-green-950/40 text-green-400" : "bg-gray-800 text-gray-500"}`}>
              {i.name} · {i.connected ? "Connected" : "Not connected"}
            </span>
          ))}
        </div>
      </Section>

      {/* Administration */}
      <Section title="Administration" icon={ShieldAlert}>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className="flex items-center gap-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white px-3.5 py-2 rounded-lg transition disabled:opacity-40"
          >
            {toggling && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {tenant.status === "active" ? "Deactivate Tenant" : "Activate Tenant"}
          </button>
          <Link href="/admin/users" className="text-sm text-indigo-400 hover:text-indigo-300 transition">
            Manage Users →
          </Link>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-indigo-400" />
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Grid({ cols = 2, children }: { cols?: number; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols >= 4 ? "lg:grid-cols-4" : ""} gap-4`}>{children}</div>;
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm text-gray-200 mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800/50 border border-gray-800 rounded-xl p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-base font-semibold text-white mt-1">{value}</p>
    </div>
  );
}
