import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isManager, isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { UsersClient } from "./UsersClient";

export default async function UsersPage() {
  const session = await auth();
  if (!session || !isManager(session.user.role)) redirect("/dashboard");

  const tenants = await db.select().from(schema.tenants).orderBy(schema.tenants.name);

  let users;
  if (isPlatformAdmin(session.user.role)) {
    users = await db.select({
      id:        schema.users.id,
      name:      schema.users.name,
      email:     schema.users.email,
      role:      schema.users.role,
      status:    schema.users.status,
      tenantId:  schema.users.tenantId,
      createdAt: schema.users.createdAt,
    }).from(schema.users).orderBy(schema.users.createdAt);
  } else {
    users = await db.select({
      id:        schema.users.id,
      name:      schema.users.name,
      email:     schema.users.email,
      role:      schema.users.role,
      status:    schema.users.status,
      tenantId:  schema.users.tenantId,
      createdAt: schema.users.createdAt,
    }).from(schema.users)
      .where(eq(schema.users.tenantId, session.user.tenantId!))
      .orderBy(schema.users.createdAt);
  }

  const userIds = users.map((u) => u.id);
  const userPerf: Record<string, { leadsCaptured: number; qualifiedLeads: number; opportunitiesCreated: number; pipelineGenerated: number }> = {};
  for (const u of users) userPerf[u.id] = { leadsCaptured: 0, qualifiedLeads: 0, opportunitiesCreated: 0, pipelineGenerated: 0 };

  let tenantKpis = { totalUsers: users.length, activeUsers: 0, leadsCaptured: 0, qualifiedLeads: 0, opportunities: 0, pipelineValue: 0 };

  if (userIds.length) {
    tenantKpis.activeUsers = users.filter((u) => u.status === "active").length;

    // Leads captured per user
    const leadsByUser = await db
      .select({ userId: schema.leads.createdByUserId, count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(inArray(schema.leads.createdByUserId, userIds))
      .groupBy(schema.leads.createdByUserId);
    for (const row of leadsByUser) {
      if (row.userId && userPerf[row.userId]) userPerf[row.userId].leadsCaptured = row.count;
    }

    // Qualified leads per user (latest score per lead, joined to creator)
    const latestScoreSq = db
      .selectDistinctOn([schema.leadScores.leadId], {
        leadId: schema.leadScores.leadId,
        classification: schema.leadScores.classification,
      })
      .from(schema.leadScores)
      .orderBy(schema.leadScores.leadId, desc(schema.leadScores.createdAt))
      .as("latest_score_users");

    const qualifiedByUser = await db
      .select({ userId: schema.leads.createdByUserId, count: sql<number>`count(*)::int` })
      .from(latestScoreSq)
      .innerJoin(schema.leads, eq(latestScoreSq.leadId, schema.leads.id))
      .where(and(inArray(schema.leads.createdByUserId, userIds), sql`${latestScoreSq.classification} in ('hot', 'warm')`))
      .groupBy(schema.leads.createdByUserId);
    for (const row of qualifiedByUser) {
      if (row.userId && userPerf[row.userId]) userPerf[row.userId].qualifiedLeads = row.count;
    }

    // Opportunities created + pipeline generated per user
    const oppsByUser = await db
      .select({
        userId: schema.opportunities.createdByUserId,
        count: sql<number>`count(*)::int`,
        pipeline: sql<string>`coalesce(sum(amount), 0)`,
      })
      .from(schema.opportunities)
      .where(inArray(schema.opportunities.createdByUserId, userIds))
      .groupBy(schema.opportunities.createdByUserId);
    for (const row of oppsByUser) {
      if (row.userId && userPerf[row.userId]) {
        userPerf[row.userId].opportunitiesCreated = row.count;
        userPerf[row.userId].pipelineGenerated = parseFloat(row.pipeline);
      }
    }

    tenantKpis.leadsCaptured = Object.values(userPerf).reduce((s, p) => s + p.leadsCaptured, 0);
    tenantKpis.qualifiedLeads = Object.values(userPerf).reduce((s, p) => s + p.qualifiedLeads, 0);
    tenantKpis.opportunities = Object.values(userPerf).reduce((s, p) => s + p.opportunitiesCreated, 0);
    tenantKpis.pipelineValue = Object.values(userPerf).reduce((s, p) => s + p.pipelineGenerated, 0);
  }

  const events = isPlatformAdmin(session.user.role)
    ? await db.select().from(schema.events).orderBy(schema.events.name)
    : await db.select().from(schema.events).where(eq(schema.events.tenantId, session.user.tenantId!)).orderBy(schema.events.name);

  return (
    <UsersClient
      initial={users}
      tenants={tenants}
      events={events}
      userPerf={userPerf}
      tenantKpis={tenantKpis}
      actorRole={session.user.role}
      actorTenantId={session.user.tenantId}
    />
  );
}
