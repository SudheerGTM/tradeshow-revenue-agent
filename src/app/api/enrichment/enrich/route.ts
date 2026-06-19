import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { enrichLead } from "@/lib/enrichment/apollo";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  // Only managers and above can trigger enrichment
  const role = session.user.role;
  if (role === "booth_user") {
    return NextResponse.json({ error: "Insufficient permissions to run enrichment" }, { status: 403 });
  }

  const { leadId } = (await req.json()) as { leadId: string };
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  // 1. Fetch lead — enforce tenant isolation
  const leadRows = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId)))
    .limit(1);

  if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const lead = leadRows[0];

  if (!lead.companyName?.trim()) {
    return NextResponse.json({ error: "Lead has no company name — cannot enrich" }, { status: 400 });
  }

  await logAudit({
    tenantId, userId: session.user.id,
    action: "enrichment_started",
    resourceType: "lead",
    resourceId: leadId,
    metadata: { companyName: lead.companyName },
  });

  // 2. Call Apollo
  let result;
  try {
    result = await enrichLead({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      companyName: lead.companyName,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Apollo enrichment failed";

    await upsertCompanyEnrichment(tenantId, leadId, null, "failed", reason);
    await upsertContactEnrichment(tenantId, leadId, null, "failed", reason);

    await logAudit({
      tenantId, userId: session.user.id,
      action: "enrichment_failed",
      resourceType: "lead",
      resourceId: leadId,
      metadata: { reason },
    });

    return NextResponse.json({ error: reason }, { status: 502 });
  }

  // 3. Persist company enrichment
  const companyStatus = result.companyFound
    ? (result.company!.confidence < 70 ? "needs_review" : "enriched")
    : "failed";

  const companyRow = await upsertCompanyEnrichment(tenantId, leadId, result.company, companyStatus, null);

  // 4. Persist contact enrichment
  const contactStatus = result.contactFound
    ? (result.contact!.confidence < 70 ? "needs_review" : "enriched")
    : "failed";

  const contactRow = await upsertContactEnrichment(tenantId, leadId, result.contact, contactStatus, null);

  // 5. Audit
  const overallStatus =
    result.companyFound && result.contactFound ? "enrichment_completed"
    : result.companyFound || result.contactFound ? "enrichment_completed"
    : "enrichment_failed";

  const needsReview = companyStatus === "needs_review" || contactStatus === "needs_review";

  await logAudit({
    tenantId, userId: session.user.id,
    action: needsReview ? "enrichment_review_required" : overallStatus,
    resourceType: "lead",
    resourceId: leadId,
    metadata: {
      companyFound: result.companyFound,
      contactFound: result.contactFound,
      companyStatus,
      contactStatus,
    },
  });

  return NextResponse.json({ company: companyRow, contact: contactRow }, { status: 200 });
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertCompanyEnrichment(
  tenantId: string,
  leadId: string,
  data: import("@/lib/enrichment/apollo").ApolloCompanyResult | null,
  status: import("@/db/schema").EnrichmentStatus,
  failureReason: string | null
) {
  const existing = await db
    .select({ id: schema.companyEnrichment.id })
    .from(schema.companyEnrichment)
    .where(and(eq(schema.companyEnrichment.leadId, leadId), eq(schema.companyEnrichment.tenantId, tenantId)))
    .limit(1);

  const values = {
    tenantId, leadId,
    companyName: data?.name ?? null,
    website: data?.website ?? null,
    linkedinUrl: data?.linkedinUrl ?? null,
    industry: data?.industry ?? null,
    subIndustry: data?.subIndustry ?? null,
    employeeCount: data?.employeeCount ?? null,
    employeeRange: data?.employeeRange ?? null,
    annualRevenue: data?.annualRevenue ?? null,
    revenueRange: data?.revenueRange ?? null,
    headquarters: data?.headquarters ?? null,
    foundedYear: data?.foundedYear ?? null,
    companyDescription: data?.description ?? null,
    apolloCompanyId: data?.apolloId ?? null,
    enrichmentStatus: status,
    needsReview: status === "needs_review",
    failureReason,
    updatedAt: new Date(),
  };

  if (existing.length) {
    const [row] = await db
      .update(schema.companyEnrichment)
      .set(values)
      .where(eq(schema.companyEnrichment.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db.insert(schema.companyEnrichment).values(values).returning();
  return row;
}

async function upsertContactEnrichment(
  tenantId: string,
  leadId: string,
  data: import("@/lib/enrichment/apollo").ApolloContactResult | null,
  status: import("@/db/schema").EnrichmentStatus,
  failureReason: string | null
) {
  const existing = await db
    .select({ id: schema.contactEnrichment.id })
    .from(schema.contactEnrichment)
    .where(and(eq(schema.contactEnrichment.leadId, leadId), eq(schema.contactEnrichment.tenantId, tenantId)))
    .limit(1);

  const values = {
    tenantId, leadId,
    firstName: data?.firstName ?? null,
    lastName: data?.lastName ?? null,
    linkedinUrl: data?.linkedinUrl ?? null,
    seniority: data?.seniority ?? null,
    department: data?.department ?? null,
    jobFunction: data?.jobFunction ?? null,
    apolloContactId: data?.apolloId ?? null,
    enrichmentStatus: status,
    needsReview: status === "needs_review",
    failureReason,
    updatedAt: new Date(),
  };

  if (existing.length) {
    const [row] = await db
      .update(schema.contactEnrichment)
      .set(values)
      .where(eq(schema.contactEnrichment.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db.insert(schema.contactEnrichment).values(values).returning();
  return row;
}
