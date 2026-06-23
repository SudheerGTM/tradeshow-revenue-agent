import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listPolicies } from "@/lib/orchestrator/policies";

// GET /api/agent-policies — read-only visibility into the policy engine.
// Policy editing UI is out of scope for this release; policies are seeded
// and managed directly in agent_policies for now.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const policies = await listPolicies();
  return NextResponse.json(policies);
}
