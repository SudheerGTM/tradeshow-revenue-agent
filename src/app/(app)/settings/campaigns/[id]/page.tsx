import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getCampaign, getCampaignICPProfiles } from "@/lib/icp/icp-resolver";
import { CampaignEditClient } from "./CampaignEditClient";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "tenant_admin" || !session.user.tenantId) redirect("/settings/campaigns");

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const campaign = await getCampaign(tenantId, id);
  if (!campaign) notFound();

  const [assignedIcpProfiles, allIcpProfiles, allEvents] = await Promise.all([
    getCampaignICPProfiles(tenantId, id),
    db.select().from(schema.icpProfiles).where(eq(schema.icpProfiles.tenantId, tenantId)).orderBy(schema.icpProfiles.name),
    // Every tenant event, not just the ones already on this Campaign — the
    // edit page lets an admin select/deselect membership from this side too.
    db.select({ id: schema.events.id, name: schema.events.name, campaignId: schema.events.campaignId })
      .from(schema.events).where(eq(schema.events.tenantId, tenantId)).orderBy(schema.events.name),
  ]);

  return (
    <CampaignEditClient
      campaign={campaign}
      assignedIcpProfileIds={assignedIcpProfiles.map((p) => p.id)}
      allIcpProfiles={allIcpProfiles}
      allEvents={allEvents}
    />
  );
}
