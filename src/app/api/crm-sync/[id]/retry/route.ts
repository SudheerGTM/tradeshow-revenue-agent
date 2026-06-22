import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { executeSync } from "@/lib/agents/crm-sync-agent";

// POST /api/crm-sync/[id]/retry — tenant_admin only, for jobs in 'failed' status.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (session.user.role !== "tenant_admin") {
    return NextResponse.json({ error: "Only tenant admins can retry a failed CRM sync" }, { status: 403 });
  }

  const { id } = await params;

  const rows = await db.select().from(schema.crmSyncJobs)
    .where(and(eq(schema.crmSyncJobs.id, id), eq(schema.crmSyncJobs.tenantId, tenantId))).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Sync job not found" }, { status: 404 });
  if (rows[0].syncStatus !== "failed") {
    return NextResponse.json({ error: "Only failed jobs can be retried" }, { status: 409 });
  }

  try {
    const result = await executeSync(id, tenantId);
    return NextResponse.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Retry failed";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
