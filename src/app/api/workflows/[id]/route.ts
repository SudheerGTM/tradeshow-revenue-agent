import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getWorkflowStatus } from "@/lib/orchestrator/orchestrator";

// GET /api/workflows/[id] — full detail with step-by-step execution history.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { id } = await params;

  try {
    const { run, executions } = await getWorkflowStatus(id, tenantId);

    if (session.user.role === "booth_user") {
      const [lead] = await db.select({ id: schema.leads.id }).from(schema.leads)
        .where(eq(schema.leads.id, run.leadId)).limit(1);
      if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [lead] = await db.select({
      firstName: schema.leads.firstName, lastName: schema.leads.lastName, companyName: schema.leads.companyName,
    }).from(schema.leads).where(eq(schema.leads.id, run.leadId)).limit(1);

    return NextResponse.json({ run, executions, lead });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Workflow not found";
    return NextResponse.json({ error: reason }, { status: 404 });
  }
}
