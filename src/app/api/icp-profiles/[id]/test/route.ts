import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getICPProfile, getICPConfiguration } from "@/lib/icp/icp-resolver";
import { evaluateICPFitQualitative, type ICPTestSampleInput } from "@/lib/icp/fit";

// POST /api/icp-profiles/:id/test — ICP Test Mode. tenant_admin only, per the
// R14.3 approval (managers don't get configuration-testing rights).
//
// SIMULATION ONLY. This route must never call Apollo, Gemini, Lead Scoring,
// the Orchestrator, CRM Sync, Opportunity, or ROI, and must never write to
// any table (no lead, no lead_score, no crm_sync_job, no opportunity, no
// followup, no audit log — per the R14.3 approval, Test Mode simulations are
// explicitly NOT audited, unlike every other ICP action in this file tree).
// If you're touching this file, keep it a pure function call — evaluateICPFitQualitative
// is itself pure (no DB, no fetch) — see src/lib/icp/fit.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const profile = await getICPProfile(tenantId, id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const sample: ICPTestSampleInput = {
    companyName: body.companyName,
    industry: body.industry,
    country: body.country,
    employeeCount: typeof body.employeeCount === "number" ? body.employeeCount : undefined,
    jobTitle: body.jobTitle,
    notes: body.notes,
  };

  const config = getICPConfiguration(profile);
  const result = evaluateICPFitQualitative(config, sample);

  return NextResponse.json({ profileId: profile.id, profileName: profile.name, sample, ...result });
}
