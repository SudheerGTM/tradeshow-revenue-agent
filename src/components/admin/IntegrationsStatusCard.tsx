import { Plug, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

type IntegrationStatus = "connected" | "disconnected" | "needs_attention";

interface Integration {
  name: string;
  status: IntegrationStatus;
  note?: string;
  detailLabel?: string;
  detailValue?: string;
}

const STATUS_META: Record<IntegrationStatus, { label: string; bg: string; text: string; icon: typeof CheckCircle2 }> = {
  connected:       { label: "Connected",       bg: "#dcfce7", text: "#16A34A", icon: CheckCircle2 },
  disconnected:    { label: "Disconnected",    bg: "#fee2e2", text: "#DC2626", icon: XCircle },
  needs_attention: { label: "Needs Attention", bg: "#fef3c7", text: "#d97706", icon: AlertTriangle },
};

export function IntegrationsStatusCard({ integrations }: { integrations: Integration[] }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
      <div className="px-4 sm:px-6 py-4 flex items-center gap-2 border-b border-[#F1F5F9]">
        <Plug className="w-4 h-4 text-[#0F4C81]" />
        <p className="text-sm font-semibold text-[#0F172A]">Integrations</p>
      </div>
      <div className="divide-y divide-[#F1F5F9]">
        {integrations.map((i) => {
          const meta = STATUS_META[i.status];
          return (
            <div key={i.name} className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0F172A]">{i.name}</p>
                {i.note && <p className="text-[11px] text-[#94A3B8] mt-0.5">{i.note}</p>}
                {i.detailLabel && (
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">
                    {i.detailLabel}: <span className="text-[#475569] font-medium">{i.detailValue}</span>
                  </p>
                )}
              </div>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg shrink-0"
                style={{ background: meta.bg, color: meta.text }}
              >
                <meta.icon className="w-3.5 h-3.5" /> {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { Integration, IntegrationStatus };
