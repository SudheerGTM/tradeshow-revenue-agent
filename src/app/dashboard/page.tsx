import { auth } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/tenant";
import { cookies } from "next/headers";
import { StatCard } from "@/components/StatCard";
import { Users, Mic, Mail, TrendingUp } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const cookieStore = await cookies();
  const slug = cookieStore.get("tenant_slug")?.value ?? "demo";
  const tenant = await getTenantBySlug(slug);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {tenant?.name ?? slug} · Welcome back, {session?.user?.name}
        </p>
      </div>

      {/* KPI cards — placeholders until Release 2 wires real data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Leads Captured"
          value="—"
          hint="Available in Release 2"
        />
        <StatCard
          icon={Mic}
          label="Voice Conversations"
          value="—"
          hint="Available in Release 3"
        />
        <StatCard
          icon={Mail}
          label="Follow-up Drafts"
          value="—"
          hint="Available in Release 4"
        />
        <StatCard
          icon={TrendingUp}
          label="Pipeline Created"
          value="—"
          hint="Available in Release 5"
        />
      </div>

      {/* Placeholder panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PlaceholderPanel title="Recent Activity" />
        <PlaceholderPanel title="Upcoming Shows" />
      </div>
    </div>
  );
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="text-sm font-medium text-gray-300 mb-4">{title}</h2>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-gray-800 rounded-md animate-pulse" />
        ))}
      </div>
    </div>
  );
}
