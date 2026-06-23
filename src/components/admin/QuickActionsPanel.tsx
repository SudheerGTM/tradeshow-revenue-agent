"use client";

import Link from "next/link";
import { UserPlus, CalendarPlus, FileBarChart, Plug, Sparkles, FileText } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface Props {
  currentEventId: string | null;
  hubspotConfigured: boolean;
  apolloConfigured: boolean;
}

export function QuickActionsPanel({ currentEventId, hubspotConfigured, apolloConfigured }: Props) {
  const toast = useToast();

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm h-full">
      <div className="px-4 sm:px-6 py-4 border-b border-[#F1F5F9]">
        <p className="text-sm font-semibold text-[#0F172A]">Quick Actions</p>
      </div>
      <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
        <ActionLink href="/admin/users" icon={UserPlus} label="Invite User" />
        <ActionLink href="/events" icon={CalendarPlus} label="Create Event" />
        {currentEventId ? (
          <ActionLink href={`/events/${currentEventId}/report`} icon={FileBarChart} label="Export ROI Report" />
        ) : (
          <ActionButton icon={FileBarChart} label="Export ROI Report" onClick={() => toast.info("Create an event first to export an ROI report.")} />
        )}
        <ActionButton
          icon={Plug}
          label={hubspotConfigured ? "HubSpot Connected" : "Connect HubSpot"}
          onClick={() => toast.info(hubspotConfigured ? "HubSpot is connected." : "Set HUBSPOT_ACCESS_TOKEN in your environment configuration to connect HubSpot.")}
        />
        <ActionButton
          icon={Sparkles}
          label={apolloConfigured ? "Apollo Connected" : "Configure Apollo"}
          onClick={() => toast.info(apolloConfigured ? "Apollo is connected." : "Set APOLLO_API_KEY in your environment configuration to connect Apollo.")}
        />
        {currentEventId ? (
          <ActionLink href={`/analytics/event/${currentEventId}`} icon={FileText} label="Generate Executive Report" />
        ) : (
          <ActionButton icon={FileText} label="Generate Executive Report" onClick={() => toast.info("Create an event first to generate an executive report.")} />
        )}
      </div>
    </div>
  );
}

function ActionLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] hover:border-[#00B8D9] hover:bg-[#F8FAFC] transition min-h-[44px]"
    >
      <Icon className="w-4 h-4 text-[#0F4C81] shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] hover:border-[#00B8D9] hover:bg-[#F8FAFC] transition min-h-[44px] text-left"
    >
      <Icon className="w-4 h-4 text-[#0F4C81] shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
