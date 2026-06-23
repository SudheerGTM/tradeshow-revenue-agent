import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isManager } from "@/lib/permissions";
import { cancelWorkflow } from "@/lib/orchestrator/orchestrator";

// POST /api/workflows/[id]/cancel — manager/tenant_admin only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  if (!isManager(session.user.role)) {
    return NextResponse.json({ error: "Only managers and tenant admins can cancel workflows" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await cancelWorkflow(id, tenantId, session.user.id ?? null);
    return NextResponse.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to cancel workflow";
    return NextResponse.json({ error: reason }, { status: 502 });
  }
}
