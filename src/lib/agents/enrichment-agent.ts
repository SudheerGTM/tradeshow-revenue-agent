/**
 * Company/Contact Enrichment Agent — callable wrapper.
 *
 * Mirrors the persistence logic in /api/enrichment/enrich so the
 * orchestrator can run this step programmatically. The API route is
 * unchanged and remains the manual-trigger entry point from the UI.
 */

import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { enrichLead, type ApolloCompanyResult, type ApolloContactResult } from "@/lib/enrichment/apollo";
import { logAudit } from "@/lib/audit";
import type { EnrichmentStatus } from "@/db/schema";

export async function runEnrichment(leadId: string, tenantId: string, userId: string | null) {
  const leadRows = await db.select().from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId))).limit(1);
  if (!leadRows.length) throw new Error("Lead not found");
  const lead = leadRows[0];

  if (!lead.companyName?.trim()) throw new Error("Lead has no company name — cannot enrich");

  await logAudit({
    tenantId, userId,
    action: "enrichment_started",
    resourceType: "lead",
    resourceId: leadId,
    metadata: { companyName: lead.companyName, triggeredBy: "orchestrator" },
  });

  let result;
  try {
    result = await enrichLead({
      firstName: lead.firstName, lastName: lead.lastName, email: lead.email, companyName: lead.companyName,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Apollo enrichment failed";
    await upsertCompanyEnrichment(tenantId, leadId, null, "failed", reason);
    await upsertContactEnrichment(tenantId, leadId, null, "failed", reason);
    await logAudit({
      tenantId, userId, action: "enrichment_failed", resourceType: "lead", resourceId: leadId,
      metadata: { reason, triggeredBy: "orchestrator" },
    });
    throw new Error(reason);
  }

  const companyStatus: EnrichmentStatus = result.companyFound ? (result.company!.confidence < 70 ? "needs_review" : "enriched") : "failed";
  const companyRow = await upsertCompanyEnrichment(tenantId, leadId, result.company, companyStatus, null);

  const contactStatus: EnrichmentStatus = result.contactFound ? (result.contact!.confidence < 70 ? "needs_review" : "enriched") : "failed";
  const contactRow = await upsertContactEnrichment(tenantId, leadId, result.contact, contactStatus, null);

  const needsReview = companyStatus === "needs_review" || contactStatus === "needs_review";
  await logAudit({
    tenantId, userId,
    action: needsReview ? "enrichment_review_required" : "enrichment_completed",
    resourceType: "lead", resourceId: leadId,
    metadata: { companyFound: result.companyFound, contactFound: result.contactFound, companyStatus, contactStatus, triggeredBy: "orchestrator" },
  });

  return { company: companyRow, contact: contactRow };
}

async function upsertCompanyEnrichment(
  tenantId: string, leadId: string, data: ApolloCompanyResult | null, status: EnrichmentStatus, failureReason: string | null
) {
  const existing = await db.select({ id: schema.companyEnrichment.id }).from(schema.companyEnrichment)
    .where(and(eq(schema.companyEnrichment.leadId, leadId), eq(schema.companyEnrichment.tenantId, tenantId))).limit(1);

  const values = {
    tenantId, leadId,
    companyName: data?.name ?? null, website: data?.website ?? null, linkedinUrl: data?.linkedinUrl ?? null,
    industry: data?.industry ?? null, subIndustry: data?.subIndustry ?? null,
    employeeCount: data?.employeeCount ?? null, employeeRange: data?.employeeRange ?? null,
    annualRevenue: data?.annualRevenue ?? null, revenueRange: data?.revenueRange ?? null,
    headquarters: data?.headquarters ?? null, foundedYear: data?.foundedYear ?? null,
    companyDescription: data?.description ?? null, apolloCompanyId: data?.apolloId ?? null,
    enrichmentStatus: status, needsReview: status === "needs_review", failureReason, updatedAt: new Date(),
  };

  if (existing.length) {
    const [row] = await db.update(schema.companyEnrichment).set(values).where(eq(schema.companyEnrichment.id, existing[0].id)).returning();
    return row;
  }
  const [row] = await db.insert(schema.companyEnrichment).values(values).returning();
  return row;
}

async function upsertContactEnrichment(
  tenantId: string, leadId: string, data: ApolloContactResult | null, status: EnrichmentStatus, failureReason: string | null
) {
  const existing = await db.select({ id: schema.contactEnrichment.id }).from(schema.contactEnrichment)
    .where(and(eq(schema.contactEnrichment.leadId, leadId), eq(schema.contactEnrichment.tenantId, tenantId))).limit(1);

  const values = {
    tenantId, leadId,
    firstName: data?.firstName ?? null, lastName: data?.lastName ?? null, linkedinUrl: data?.linkedinUrl ?? null,
    seniority: data?.seniority ?? null, department: data?.department ?? null, jobFunction: data?.jobFunction ?? null,
    apolloContactId: data?.apolloId ?? null, enrichmentStatus: status, needsReview: status === "needs_review",
    failureReason, updatedAt: new Date(),
  };

  if (existing.length) {
    const [row] = await db.update(schema.contactEnrichment).set(values).where(eq(schema.contactEnrichment.id, existing[0].id)).returning();
    return row;
  }
  const [row] = await db.insert(schema.contactEnrichment).values(values).returning();
  return row;
}
