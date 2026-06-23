import Link from "next/link";
import { CalendarDays, Users, Star, Briefcase, TrendingUp, Zap, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export interface CurrentEventData {
  id: string;
  name: string;
  status: string;
  leadsCaptured: number;
  qualifiedLeads: number;
  opportunities: number;
  pipelineValue: number;
  expectedRevenue: number;
}

const STATUS_VARIANT: Record<string, "green" | "blue" | "gray" | "red"> = {
  active: "green", upcoming: "blue", completed: "gray", cancelled: "red",
};

function fmtGBP(n: number) { return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`; }

export function CurrentEventCard({ event }: { event: CurrentEventData | null }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm">
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#0F4C81]" />
          <p className="text-sm font-semibold text-[#0F172A]">Current Event</p>
        </div>
        {event && (
          <Link href={`/analytics/event/${event.id}`} className="text-xs text-[#00B8D9] hover:text-[#009ab8] font-medium flex items-center gap-1">
            Dashboard <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {!event ? (
        <p className="px-4 sm:px-6 py-6 text-sm text-[#94A3B8] text-center">No events yet — create one to start tracking ROI.</p>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-lg font-bold text-[#0F172A]">{event.name}</p>
            <Badge variant={STATUS_VARIANT[event.status] ?? "gray"}>{event.status}</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat icon={Users} label="Leads Captured" value={String(event.leadsCaptured)} color="#0F4C81" bg="#dbeafe" />
            <Stat icon={Star} label="Qualified" value={String(event.qualifiedLeads)} color="#d97706" bg="#fef3c7" />
            <Stat icon={Briefcase} label="Opportunities" value={String(event.opportunities)} color="#00B8D9" bg="#e6f8fc" />
            <Stat icon={TrendingUp} label="Pipeline" value={fmtGBP(event.pipelineValue)} color="#0F4C81" bg="#dbeafe" />
            <Stat icon={Zap} label="Expected Revenue" value={fmtGBP(event.expectedRevenue)} color="#16A34A" bg="#dcfce7" />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color, bg }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color: string; bg: string;
}) {
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: bg }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <p className="text-lg font-bold text-[#0F172A] truncate">{value}</p>
      <p className="text-[10px] text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  );
}
