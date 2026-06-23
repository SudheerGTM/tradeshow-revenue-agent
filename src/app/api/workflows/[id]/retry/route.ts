import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isManager } from "@/lib/permissions";
import { resumeWorkflow } from "@/lib/orchestrator/orchestrator";

// POST /api/workflows/[id]/retry — manager/tenant_admin only, per the spec's
// security section ("Managers: Retry workflows").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!isManager(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can retry workflows" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await resumeWorkflow(id, tenantId, session.user.id ?? null);
    return NextResponse.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to retry workflow";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
