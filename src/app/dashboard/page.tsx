import { auth } from "@/lib/auth";
import { getTenantById } from "@/lib/tenant";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { Users, Star, ThumbsDown, Mail, BarChart2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

export default async function DashboardPage() {
  const session = await auth();
  const cookieStore = await cookies();
  const slug = cookieStore.get("tenant_slug")?.value ?? "demo";
  const tenant = session?.user?.tenantId
    ? await getTenantById(session.user.tenantId)
    : null;

  // Lead stats — only for tenant users
  let stats = { total: 0, new: 0, qualified: 0, disqualified: 0, contacted: 0 };
  let byEvent: { eventName: string | null; count: number }[] = [];

  if (session?.user?.tenantId) {
    const tenantId = session.user.tenantId;

    const byStatus = await db
      .select({ status: schema.leads.status, count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(eq(schema.leads.tenantId, tenantId))
      .groupBy(schema.leads.status);

    for (const r of byStatus) {
      stats.total += r.count;
      if (r.status in stats) stats[r.status as keyof typeof stats] = r.count;
    }

    const eventRows = await db
      .select({
        eventName: schema.events.name,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.leads)
      .leftJoin(schema.events, eq(schema.leads.eventId, schema.events.id))
      .where(eq(schema.leads.tenantId, tenantId))
      .groupBy(schema.events.name)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    byEvent = eventRows;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {tenant?.name ?? (session?.user?.role === "platform_admin" ? "Platform Overview" : slug)}
          {session?.user?.name ? ` · Welcome back, ${session.user.name}` : ""}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Total Leads" value={stats.total} color="indigo"
          href="/leads" />
        <KpiCard icon={Mail} label="New Leads" value={stats.new} color="blue"
          href="/leads?status=new" />
        <KpiCard icon={Star} label="Qualified" value={stats.qualified} color="emerald"
          href="/leads?status=qualified" />
        <KpiCard icon={ThumbsDown} label="Disqualified" value={stats.disqualified} color="red"
          href="/leads?status=disqualified" />
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads by event */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Leads by Event</h2>
            <Link href="/events" className="text-xs text-indigo-400 hover:text-indigo-300">
              Manage events →
            </Link>
          </div>
          {byEvent.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No leads captured yet.</p>
          ) : (
            <div className="space-y-2.5">
              {byEvent.map((row, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300 truncate">{row.eventName ?? "No event"}</span>
                  <Badge variant="blue">{row.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: "/leads/new",  label: "Capture a lead",   desc: "Add a new contact from the floor" },
              { href: "/leads",      label: "View all leads",    desc: "Search, filter and manage leads" },
              { href: "/events",     label: "Manage events",     desc: "Create or view trade show events" },
            ].map(({ href, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition group"
              >
                <BarChart2 className="w-4 h-4 text-gray-500 group-hover:text-indigo-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, color, href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; color: string; href: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: "text-indigo-400 bg-indigo-600/10",
    blue:   "text-blue-400   bg-blue-600/10",
    emerald:"text-emerald-400 bg-emerald-600/10",
    red:    "text-red-400    bg-red-600/10",
  };

  return (
    <Link href={href} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition block">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
    </Link>
  );
}
