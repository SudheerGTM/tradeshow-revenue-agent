import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";

// GET /api/agents — registry + tenant-scoped health stats per agent
// (success rate, average runtime, last execution, retry count).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const registry = await db.select().from(schema.agentRegistry).orderBy(schema.agentRegistry.agentName);

  const stats = await db
    .select({
      agentName: schema.agentExecutions.agentName,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      skipped: sql<number>`count(*) filter (where status = 'skipped')::int`,
      avgDurationMs: sql<string>`coalesce(avg(duration_ms) filter (where status = 'completed'), 0)`,
      totalRetries: sql<number>`coalesce(sum(retry_count), 0)::int`,
    })
    .from(schema.agentExecutions)
    .where(eq(schema.agentExecutions.tenantId, tenantId))
    .groupBy(schema.agentExecutions.agentName);

  const lastExecRows = await db
    .selectDistinctOn([schema.agentExecutions.agentName], {
      agentName: schema.agentExecutions.agentName,
      createdAt: schema.agentExecutions.createdAt,
      status: schema.agentExecutions.status,
    })
    .from(schema.agentExecutions)
    .where(eq(schema.agentExecutions.tenantId, tenantId))
    .orderBy(schema.agentExecutions.agentName, desc(schema.agentExecutions.createdAt));

  const statsByAgent = new Map(stats.map((s) => [s.agentName, s]));
  const lastByAgent = new Map(lastExecRows.map((l) => [l.agentName, l]));

  const agents = registry.map((agent) => {
    const s = statsByAgent.get(agent.agentName);
    const last = lastByAgent.get(agent.agentName);
    const finished = (s?.completed ?? 0) + (s?.failed ?? 0);
    const successRate = finished > 0 ? Math.round(((s?.completed ?? 0) / finished) * 100) : null;

    return {
      ...agent,
      totalExecutions: s?.total ?? 0,
      completedExecutions: s?.completed ?? 0,
      failedExecutions: s?.failed ?? 0,
      skippedExecutions: s?.skipped ?? 0,
      successRate,
      avgRuntimeMs: s ? Math.round(parseFloat(s.avgDurationMs)) : null,
      totalRetries: s?.totalRetries ?? 0,
      lastExecutionAt: last?.createdAt ? last.createdAt.toISOString() : null,
      lastExecutionStatus: last?.status ?? null,
    };
  });

  return NextResponse.json(agents);
}
