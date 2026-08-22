import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaign, getCampaignICPProfiles, getICPConfiguration } from "@/lib/icp/icp-resolver";
import { evaluateICPFitQualitative, type ICPTestSampleInput } from "@/lib/icp/fit";

const OVERALL_RANK: Record<string, number> = { Strong: 3, Moderate: 2, Weak: 1, Unknown: 0 };

// POST /api/campaigns/:id/test — Campaign Test Mode. tenant_admin only, same
// simulation-only rules as ICP Test Mode: no numeric score, no Apollo, no
// workflow, no CRM, no opportunity, no follow-up, no ROI impact, not audited.
//
// Reuses evaluateICPFitQualitative() once per ICP assigned to this Campaign
// — evaluated independently (OR semantics), never merged into one combined
// config. This route contains zero new matching logic.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const campaign = await getCampaign(tenantId, id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const icpProfiles = await getCampaignICPProfiles(tenantId, id);
  if (icpProfiles.length === 0) {
    return NextResponse.json({ error: "This campaign has no ICP profiles assigned yet" }, { status: 400 });
  }

  const body = await req.json();
  const sample: ICPTestSampleInput = {
    companyName: body.companyName,
    industry: body.industry,
    country: body.country,
    employeeCount: typeof body.employeeCount === "number" ? body.employeeCount : undefined,
    jobTitle: body.jobTitle,
    notes: body.notes,
  };

  const results = icpProfiles.map((profile) => {
    const config = getICPConfiguration(profile);
    const match = evaluateICPFitQualitative(config, sample);
    return { profileId: profile.id, profileName: profile.name, ...match };
  });

  const ranked = [...results].sort((a, b) => OVERALL_RANK[b.overall] - OVERALL_RANK[a.overall]);
  const primary = ranked[0].overall === "Unknown" && ranked.every((r) => r.overall === "Unknown") ? null : ranked[0];
  const otherMatches = ranked.slice(1).filter((r) => r.overall !== "Weak" && r.overall !== "Unknown");
  const noMatch = ranked.filter((r) => r.overall === "Weak" || r.overall === "Unknown");

  return NextResponse.json({
    campaignId: campaign.id,
    campaignName: campaign.name,
    sample,
    results,
    primaryMatch: primary ? { profileId: primary.profileId, profileName: primary.profileName, overall: primary.overall } : null,
    otherMatches: otherMatches.map((r) => ({ profileId: r.profileId, profileName: r.profileName, overall: r.overall })),
    noMatch: noMatch.map((r) => ({ profileId: r.profileId, profileName: r.profileName, overall: r.overall })),
  });
}
