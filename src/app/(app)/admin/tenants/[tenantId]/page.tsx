import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getPlan } from "@/lib/plans";
import { TenantDetailClient, type TenantDetailData } from "./TenantDetailClient";

export default async function TenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) redirect("/dashboard");

  const { tenantId } = await params;
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant) notFound();

  // ── Overview ────────────────────────────────────────────────────────────
  const [tenantAdmin] = await db.select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.role, "tenant_admin")))
    .orderBy(schema.users.createdAt).limit(1);
  const [lastActivityRow] = await db.select({ lastActivityAt: schema.users.lastActivityAt })
    .from(schema.users)
    .where(eq(schema.users.tenantId, tenantId))
    .orderBy(desc(schema.users.lastActivityAt)).limit(1);

  // ── Adoption ────────────────────────────────────────────────────────────
  const [userCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.tenantId, tenantId));
  const [activeUserCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.status, "active")));
  const [leadCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.leads).where(eq(schema.leads.tenantId, tenantId));

  const latestScoreSq = db
    .selectDistinctOn([schema.leadScores.leadId], { leadId: schema.leadScores.leadId, classification: schema.leadScores.classification })
    .from(schema.leadScores)
    .where(eq(schema.leadScores.tenantId, tenantId))
    .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
    .as("latest_score_tenant_detail");
  const [qualifiedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(latestScoreSq).where(sql`${latestScoreSq.classification} in ('hot', 'warm')`);

  const [oppRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pipeline: sql<string>`coalesce(sum(amount), 0)`,
      expectedRevenue: sql<string>`coalesce(sum(expected_revenue), 0)`,
    })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.tenantId, tenantId), eq(schema.opportunities.status, "active")));

  // ── Events (single-ICP model — extended to multi-ICP in a later step) ────
  const events = await db.select().from(schema.events).where(eq(schema.events.tenantId, tenantId)).orderBy(desc(schema.events.startDate));

  // ── Targeting ───────────────────────────────────────────────────────────
  const icpProfiles = await db.select().from(schema.icpProfiles).where(eq(schema.icpProfiles.tenantId, tenantId)).orderBy(schema.icpProfiles.name);
  const defaultIcp = icpProfiles.find((p) => p.id === tenant.defaultIcpProfileId) ?? null;

  // ── Integrations — global env vars, same values for every tenant. See
  // the note rendered in the client component. ─────────────────────────────
  const integrations = [
    { name: "Apollo", connected: !!process.env.APOLLO_API_KEY },
    { name: "Gemini", connected: !!process.env.GEMINI_API_KEY },
    { name: "HubSpot", connected: !!process.env.HUBSPOT_ACCESS_TOKEN },
    { name: "AWS S3", connected: !!process.env.AWS_ACCESS_KEY_ID },
    { name: "AWS Transcribe", connected: false },
    { name: "AWS SES", connected: !!process.env.AWS_ACCESS_KEY_ID },
  ];

  const plan = getPlan(tenant.planName);

  const data: TenantDetailData = {
    tenant,
    plan,
    tenantAdmin: tenantAdmin ?? null,
    lastActivityAt: lastActivityRow?.lastActivityAt ? lastActivityRow.lastActivityAt.toISOString() : null,
    adoption: {
      totalUsers: userCountRow?.count ?? 0,
      activeUsers: activeUserCountRow?.count ?? 0,
      leadsCaptured: leadCountRow?.count ?? 0,
      qualifiedLeads: qualifiedRow?.count ?? 0,
      opportunities: oppRow?.count ?? 0,
      pipelineValue: parseFloat(oppRow?.pipeline ?? "0"),
      expectedRevenue: parseFloat(oppRow?.expectedRevenue ?? "0"),
    },
    events: events.map((e) => ({
      id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate, status: e.status,
      assignedIcpCount: e.icpProfileId ? 1 : 0,
      campaignName: null, // no Campaign concept yet — wired in a later step
    })),
    targeting: {
      defaultIcpName: defaultIcp?.name ?? null,
      icpProfileCount: icpProfiles.length,
      activeIcpProfileCount: icpProfiles.filter((p) => p.status === "active").length,
      campaignCount: 0, // no Campaign concept yet — wired in a later step
    },
    integrations,
  };

  return <TenantDetailClient data={data} />;
}
