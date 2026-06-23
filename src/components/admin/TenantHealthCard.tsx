import { HeartPulse } from "lucide-react";

export interface TenantHealthData {
  overall: number;
  userActivity: number;
  leadCapture: number;
  crmSyncHealth: number;
  opportunityConversion: number;
}

function tier(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: "Excellent", color: "#16A34A", bg: "#dcfce7" };
  if (score >= 70) return { label: "Good", color: "#0F4C81", bg: "#dbeafe" };
  if (score >= 50) return { label: "Fair", color: "#d97706", bg: "#fef3c7" };
  return { label: "Needs Attention", color: "#DC2626", bg: "#fee2e2" };
}

export function TenantHealthCard({ health }: { health: TenantHealthData }) {
  const t = tier(health.overall);
  const indicators = [
    { label: "User Activity", value: health.userActivity },
    { label: "Lead Capture", value: health.leadCapture },
    { label: "CRM Sync Health", value: health.crmSyncHealth },
    { label: "Opportunity Conversion", value: health.opportunityConversion },
  ];

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm h-full">
      <div className="px-4 sm:px-6 py-4 flex items-center gap-2 border-b border-[#F1F5F9]">
        <HeartPulse className="w-4 h-4 text-[#0F4C81]" />
        <p className="text-sm font-semibold text-[#0F172A]">Tenant Health</p>
      </div>
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0" style={{ background: t.bg }}>
            <span className="text-xl font-bold" style={{ color: t.color }}>{health.overall}%</span>
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: t.color }}>{t.label}</p>
            <p className="text-xs text-[#94A3B8] mt-0.5">Composite tenant health score</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {indicators.map((i) => (
            <div key={i.label}>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-[#475569]">{i.label}</span>
                <span className="text-xs font-medium text-[#0F172A]">{Math.round(i.value)}%</span>
              </div>
              <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, i.value)}%`, background: tier(i.value).color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
