import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq, desc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/PageHeader";
import { CampaignListClient } from "./CampaignListClient";

export default async function CampaignsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Release 14.4 — same access model as ICP Configuration: tenant_admin-only.
  if (session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Campaigns" description="Tenant administrator access only" />
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 sm:p-6 text-sm text-[#475569]">
          Campaigns are managed by your tenant administrator.
        </div>
      </div>
    );
  }

  const tenantId = session.user.tenantId;

  const rows = await db
    .select({
      campaign: schema.campaigns,
      icpCount: sql<number>`count(distinct ${schema.campaignIcpProfiles.id})::int`,
      eventCount: sql<number>`count(distinct ${schema.events.id})::int`,
    })
    .from(schema.campaigns)
    .leftJoin(schema.campaignIcpProfiles, eq(schema.campaignIcpProfiles.campaignId, schema.campaigns.id))
    .leftJoin(schema.events, eq(schema.events.campaignId, schema.campaigns.id))
    .where(eq(schema.campaigns.tenantId, tenantId))
    .groupBy(schema.campaigns.id)
    .orderBy(desc(schema.campaigns.updatedAt));

  const campaigns = rows.map((r) => ({ ...r.campaign, icpCount: r.icpCount, eventCount: r.eventCount }));

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Campaigns"
        description="A GTM initiative that can target multiple ICPs at once. Optional — events can also target ICPs directly, or fall back to your tenant's Default ICP."
      />
      <CampaignListClient initialCampaigns={campaigns} />
    </div>
  );
}
