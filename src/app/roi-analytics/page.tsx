import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { recalculateAndStoreROI } from "@/lib/agents/roi-agent";
import Link from "next/link";
import { CalendarDays, BarChart3, FileText, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export default async function ROIAnalyticsIndexPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/dashboard");

  const events = await db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId)).orderBy(schema.events.startDate);

  const eventsWithROI = await Promise.all(
    events.map(async (ev) => {
      const { result } = await recalculateAndStoreROI(ev.id, tenantId, session.user.id);
      return { event: ev, metrics: result };
    })
  );

  const bestEvent = eventsWithROI
    .filter(e => e.metrics.roiPercentage != null)
    .sort((a, b) => (b.metrics.roiPercentage ?? -Infinity) - (a.metrics.roiPercentage ?? -Infinity))[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">ROI Analytics</h1>
        <p className="text-sm text-[#475569] mt-0.5">Trade show return on investment, by event</p>
      </div>

      {bestEvent && (
        <div className="bg-white border border-[#16A34A]/30 rounded-xl p-5 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#dcfce7] flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-[#16A34A]" />
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Best Performing Event</p>
            <p className="text-sm font-semibold text-[#0F172A]">{bestEvent.event.name} · {bestEvent.metrics.roiPercentage}% ROI</p>
          </div>
        </div>
      )}

      {eventsWithROI.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center shadow-sm">
          <CalendarDays className="w-10 h-10 text-[#E2E8F0] mx-auto mb-3" />
          <p className="text-sm text-[#94A3B8]">No events yet. Create an event to start tracking ROI.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventsWithROI.map(({ event, metrics }) => (
            <div key={event.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0F172A] leading-tight">{event.name}</h3>
                <Badge variant={metrics.roiPercentage != null && metrics.roiPercentage >= 0 ? "green" : "red"}>
                  {metrics.roiPercentage != null ? `${metrics.roiPercentage}%` : "n/a"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-[#475569]">
                <span>Cost: £{metrics.totalEventCost.toLocaleString("en-GB")}</span>
                <span>Leads: {metrics.totalLeads}</span>
                <span>Pipeline: £{metrics.pipelineGenerated.toLocaleString("en-GB")}</span>
                <span>Won: £{metrics.wonRevenue.toLocaleString("en-GB")}</span>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-[#F1F5F9]">
                <Link href={`/analytics/event/${event.id}`} className="flex items-center gap-1 text-xs text-[#475569] hover:text-[#0F4C81] transition">
                  <BarChart3 className="w-3.5 h-3.5" /> Dashboard
                </Link>
                <Link href={`/events/${event.id}/report`} className="flex items-center gap-1 text-xs text-[#475569] hover:text-[#0F4C81] transition">
                  <FileText className="w-3.5 h-3.5" /> Report
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
