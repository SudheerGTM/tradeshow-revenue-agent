import { CreditCard } from "lucide-react";

// Placeholder only — no billing/usage backend exists yet. Values are
// illustrative so the section reads as a real SaaS plan summary rather
// than an empty stub.
export function SubscriptionPlaceholderCard() {
  const usage = [
    { label: "Users", value: "3 / 10" },
    { label: "Lead Usage", value: "128 / 1,000 this month" },
    { label: "Storage", value: "1.2 GB / 25 GB" },
  ];

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#0F4C81]" />
          <p className="text-sm font-semibold text-[#0F172A]">Subscription &amp; Usage</p>
        </div>
        <span className="text-[10px] font-semibold text-[#94A3B8] bg-[#F1F5F9] px-2 py-0.5 rounded-lg">Coming Soon</span>
      </div>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Current Plan</p>
            <p className="text-base font-semibold text-[#0F172A] mt-0.5">Trade Show Pro</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#94A3B8]">Renewal Date</p>
            <p className="text-sm font-medium text-[#0F172A] mt-0.5">1 Jan 2027</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {usage.map((u) => (
            <div key={u.label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">{u.label}</p>
              <p className="text-sm font-semibold text-[#0F172A] mt-1">{u.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
