import { CreditCard } from "lucide-react";
import { usageState, type PlanLimits } from "@/lib/plans";

export interface PlanUsageMetric {
  label: string;
  used: number;
  limit: number;
  unit?: string;    // e.g. "GB" — rendered after the number, no space before "/"
  suffix?: string;  // e.g. " this month" — rendered after the fraction
  detail?: string;  // small secondary line, e.g. cached-reuse count
}

const STATE_STYLE: Record<string, { bar: string; text: string }> = {
  normal:      { bar: "#16A34A", text: "#475569" },
  approaching: { bar: "#F59E0B", text: "#92400e" },
  near_limit:  { bar: "#DC2626", text: "#DC2626" },
  over:        { bar: "#DC2626", text: "#DC2626" },
};

function fmt(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: n < 10 ? 2 : 0 });
}

// Release 14.3.1 — replaces SubscriptionPlaceholderCard. Real numbers, no
// billing backend: everything here is informational, nothing is enforced.
export function PlanUsageCard({ plan, usage }: { plan: PlanLimits; usage: PlanUsageMetric[] }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#0F4C81]" />
          <p className="text-sm font-semibold text-[#0F172A]">Plan &amp; Usage</p>
        </div>
        <span className="text-[10px] font-semibold text-[#94A3B8] bg-[#F1F5F9] px-2 py-0.5 rounded-lg">Informational</span>
      </div>
      <div className="p-4 sm:p-6 space-y-4">
        <div>
          <p className="text-xs text-[#94A3B8]">Current Plan</p>
          <p className="text-base font-semibold text-[#0F172A] mt-0.5">{plan.label}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {usage.map((u) => {
            const state = usageState(u.used, u.limit);
            const style = STATE_STYLE[state];
            const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
            return (
              <div key={u.label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
                <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">{u.label}</p>
                <p className="text-sm font-semibold mt-1" style={{ color: style.text }}>
                  {fmt(u.used)}{u.unit ?? ""} / {fmt(u.limit)}{u.unit ?? ""}{u.suffix ?? ""}
                </p>
                <div className="h-1.5 bg-[#E2E8F0] rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: style.bar }} />
                </div>
                {u.detail && <p className="text-[10px] text-[#94A3B8] mt-1">{u.detail}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
