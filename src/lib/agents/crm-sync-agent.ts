/**
 * CRM Sync Agent — Release 10
 *
 * Prepares a CRM sync payload (contact/company/deal/task) from lead,
 * conversation intelligence, company enrichment, lead score, and follow-up
 * data. Never writes to HubSpot directly — that only happens after a
 * manager/tenant_admin explicitly approves the prepared payload via
 * /api/crm-sync/[id]/approve, which calls executeSync().
 */

import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import {
  createContact, createCompany, createDeal, createTask,
  searchExistingContact, searchExistingCompany,
} from "@/lib/integrations/hubspot";
import type { ScoreClassification, FollowupTiming } from "@/db/schema";

type DbOrTx = Pick<typeof db, "select" | "insert" | "update">;

/**
 * Idempotent CRM sync job creation (Release 13.7.1 — workflow idempotency).
 *
 * Re-running the workflow for the same lead must not pile up duplicate
 * pending_approval jobs. Only one active (pending_approval) job per
 * tenant+lead+syncType should exist at a time — re-preparing refreshes its
 * payload in place instead of inserting a new row. Completed/failed jobs
 * are left untouched as historical/audit records.
 */
export async function upsertPendingCRMSyncJob(
  dbClient: DbOrTx,
  params: {
    tenantId: string;
    eventId: string | null;
    leadId: string;
    createdByUserId: string | null;
    syncPayload: Record<string, unknown>;
  }
): Promise<{ job: typeof schema.crmSyncJobs.$inferSelect; wasExisting: boolean }> {
  const [existing] = await dbClient
    .select({ id: schema.crmSyncJobs.id })
    .from(schema.crmSyncJobs)
    .where(and(
      eq(schema.crmSyncJobs.tenantId, params.tenantId),
      eq(schema.crmSyncJobs.leadId, params.leadId),
      eq(schema.crmSyncJobs.syncType, "full_sync"),
      eq(schema.crmSyncJobs.syncStatus, "pending_approval"),
    ))
    .limit(1);

  if (existing) {
    const [job] = await dbClient
      .update(schema.crmSyncJobs)
      .set({ syncPayload: params.syncPayload, eventId: params.eventId, updatedAt: new Date() })
      .where(eq(schema.crmSyncJobs.id, existing.id))
      .returning();
    return { job, wasExisting: true };
  }

  const [job] = await dbClient
    .insert(schema.crmSyncJobs)
    .values({
      tenantId: params.tenantId,
      eventId: params.eventId,
      leadId: params.leadId,
      createdByUserId: params.createdByUserId,
      syncType: "full_sync",
      syncStatus: "pending_approval",
      syncPayload: params.syncPayload,
    })
    .returning();
  return { job, wasExisting: false };
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CRMPayloadPreview {
  classification: ScoreClassification | null;
  allowSync: boolean;
  blockedReason?: string;

  contact: {
    firstname: string;
    lastname?: string;
    email?: string;
    phone?: string;
    jobtitle?: string;
    company?: string;
  } | null;

  company: {
    name: string;
    domain?: string;
    industry?: string;
    numberofemployees?: string;
    city?: string;
  } | null;

  deal: {
    dealname: string;
    amount?: number;
    dealstage: string;
    description: string;
  } | null;

  task: {
    subject: string;
    body: string;
    dueDate: string | null;
  } | null;

  duplicates: {
    contact: { id: string } | null;
    company: { id: string } | null;
  };
}

interface SyncPlan {
  createContact: boolean;
  createCompany: boolean;
  createDeal: boolean;
  createTask: boolean;
}

function getSyncPlan(classification: ScoreClassification | null): SyncPlan {
  switch (classification) {
    case "hot":
      return { createContact: true, createCompany: true, createDeal: true, createTask: true };
    case "warm":
      return { createContact: true, createCompany: true, createDeal: false, createTask: true };
    case "cold":
      return { createContact: true, createCompany: false, createDeal: false, createTask: false };
    case "needs_review":
    default:
      return { createContact: false, createCompany: false, createDeal: false, createTask: false };
  }
}

const TIMING_TO_DAYS: Record<FollowupTiming, number> = {
  immediate: 0, "24_hours": 1, "3_days": 3, "1_week": 7, "2_weeks": 14,
};

// ─── Prepare (no writes) ────────────────────────────────────────────────────

export async function prepareCRMRecord(leadId: string, tenantId: string): Promise<CRMPayloadPreview> {
  const leadRows = await db.select().from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.tenantId, tenantId))).limit(1);
  if (!leadRows.length) throw new Error("Lead not found");
  const lead = leadRows[0];

  const [insight] = await db.select().from(schema.conversationInsights)
    .where(and(eq(schema.conversationInsights.leadId, leadId), eq(schema.conversationInsights.tenantId, tenantId)))
    .orderBy(desc(schema.conversationInsights.createdAt)).limit(1);

  const [company] = await db.select().from(schema.companyEnrichment)
    .where(and(eq(schema.companyEnrichment.leadId, leadId), eq(schema.companyEnrichment.tenantId, tenantId)))
    .orderBy(desc(schema.companyEnrichment.updatedAt)).limit(1);

  const [score] = await db.select().from(schema.leadScores)
    .where(and(eq(schema.leadScores.leadId, leadId), eq(schema.leadScores.tenantId, tenantId)))
    .orderBy(desc(schema.leadScores.createdAt)).limit(1);

  const [followup] = await db.select().from(schema.followupRecommendations)
    .where(and(eq(schema.followupRecommendations.leadId, leadId), eq(schema.followupRecommendations.tenantId, tenantId)))
    .orderBy(desc(schema.followupRecommendations.createdAt)).limit(1);

  const classification = score?.classification ?? null;
  const plan = getSyncPlan(classification);

  if (!score) {
    return {
      classification: null, allowSync: false,
      blockedReason: "This lead has no score yet. Generate a lead score before preparing a CRM sync.",
      contact: null, company: null, deal: null, task: null,
      duplicates: { contact: null, company: null },
    };
  }

  if (classification === "needs_review") {
    return {
      classification, allowSync: false,
      blockedReason: "This lead's score is classified as Needs Review. CRM sync is not permitted until the score is reviewed and resolved.",
      contact: null, company: null, deal: null, task: null,
      duplicates: { contact: null, company: null },
    };
  }

  // Build contact payload
  const contactPayload = plan.createContact ? {
    firstname: lead.firstName,
    lastname: lead.lastName ?? undefined,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    jobtitle: lead.jobTitle ?? undefined,
    company: lead.companyName,
  } : null;

  // Build company payload
  const domain = company?.website ? extractDomain(company.website) : undefined;
  const companyPayload = plan.createCompany ? {
    name: lead.companyName,
    domain,
    industry: company?.industry ?? undefined,
    numberofemployees: company?.employeeCount ?? undefined,
    city: company?.headquarters ?? undefined,
  } : null;

  // Build deal payload
  const painPoints = toArray(insight?.painPoints).join("; ");
  const descriptionParts = [
    insight?.summary ? `Conversation Summary: ${insight.summary}` : null,
    painPoints ? `Pain Points: ${painPoints}` : null,
    insight?.businessNeed ? `Business Need: ${insight.businessNeed}` : null,
    score?.recommendedNextAction ? `Recommended Next Action: ${score.recommendedNextAction}` : null,
  ].filter(Boolean);

  const dealPayload = plan.createDeal ? {
    dealname: `${lead.companyName} - Trade Show Opportunity`,
    amount: score?.estimatedOpportunityValue ? Math.round(parseFloat(score.estimatedOpportunityValue)) : undefined,
    dealstage: "Trade Show Qualified",
    description: descriptionParts.join("\n\n") || "No additional context captured.",
  } : null;

  // Build task payload
  let taskPayload = null;
  if (plan.createTask) {
    const days = TIMING_TO_DAYS[followup?.recommendedTiming ?? "1_week"];
    const dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const followupSummary = followup?.messageContent
      ? `Follow-up draft prepared: ${followup.messageContent.slice(0, 200)}${followup.messageContent.length > 200 ? "…" : ""}`
      : "No follow-up draft prepared yet.";

    taskPayload = {
      subject: `Follow up with ${lead.firstName} ${lead.lastName ?? ""} (${lead.companyName})`,
      body: [
        `Recommended Timing: ${followup?.recommendedTiming ?? "1_week"}`,
        score?.recommendedNextAction ? `Recommended Next Action: ${score.recommendedNextAction}` : null,
        followupSummary,
      ].filter(Boolean).join("\n\n"),
      dueDate: dueDate.toISOString(),
    };
  }

  // Duplicate detection (best-effort — failures don't block the preview)
  let dupContact: { id: string } | null = null;
  let dupCompany: { id: string } | null = null;
  try {
    if (contactPayload?.email) {
      const existing = await searchExistingContact(contactPayload.email);
      if (existing) dupContact = { id: existing.id };
    }
  } catch {
    // duplicate check is best-effort; ignore failures at preview time
  }
  try {
    if (companyPayload) {
      const existing = await searchExistingCompany(companyPayload.name, companyPayload.domain);
      if (existing) dupCompany = { id: existing.id };
    }
  } catch {
    // duplicate check is best-effort; ignore failures at preview time
  }

  return {
    classification,
    allowSync: true,
    contact: contactPayload,
    company: companyPayload,
    deal: dealPayload,
    task: taskPayload,
    duplicates: { contact: dupContact, company: dupCompany },
  };
}

// ─── Execute (writes to HubSpot — only after approval) ─────────────────────

export async function executeSync(jobId: string, tenantId: string) {
  const [job] = await db.select().from(schema.crmSyncJobs)
    .where(and(eq(schema.crmSyncJobs.id, jobId), eq(schema.crmSyncJobs.tenantId, tenantId))).limit(1);
  if (!job) throw new Error("Sync job not found");
  if (job.syncStatus !== "approved" && job.syncStatus !== "failed") {
    throw new Error(`Sync job is in status '${job.syncStatus}' and cannot be executed`);
  }

  await db.update(schema.crmSyncJobs).set({ syncStatus: "processing", updatedAt: new Date() }).where(eq(schema.crmSyncJobs.id, jobId));

  await logAudit({
    tenantId, userId: job.createdByUserId,
    action: "crm_sync_started",
    resourceType: "crm_sync",
    resourceId: jobId,
    metadata: { leadId: job.leadId },
  });

  const payload = job.syncPayload as unknown as CRMPayloadPreview;
  const response: Record<string, unknown> = {};
  let contactId: string | null = job.hubspotContactId;
  let companyId: string | null = job.hubspotCompanyId;
  let dealId: string | null = job.hubspotDealId;
  let taskId: string | null = job.hubspotTaskId;

  try {
    if (payload.contact && !contactId) {
      const result = await createContact(payload.contact);
      contactId = result.id;
      response.contact = result.raw;
    }

    if (payload.company && !companyId) {
      const result = await createCompany(payload.company);
      companyId = result.id;
      response.company = result.raw;
    }

    if (payload.deal && !dealId) {
      const result = await createDeal({
        dealname: payload.deal.dealname,
        amount: payload.deal.amount,
        dealstage: payload.deal.dealstage,
        description: payload.deal.description,
        contactId: contactId ?? undefined,
        companyId: companyId ?? undefined,
      });
      dealId = result.id;
      response.deal = result.raw;
    }

    if (payload.task && !taskId) {
      const result = await createTask({
        subject: payload.task.subject,
        body: payload.task.body,
        dueDate: payload.task.dueDate ? new Date(payload.task.dueDate) : undefined,
        contactId: contactId ?? undefined,
      });
      taskId = result.id;
      response.task = result.raw;
    }

    const [updated] = await db.update(schema.crmSyncJobs).set({
      syncStatus: "completed",
      hubspotContactId: contactId,
      hubspotCompanyId: companyId,
      hubspotDealId: dealId,
      hubspotTaskId: taskId,
      syncResponse: response,
      failureReason: null,
      updatedAt: new Date(),
    }).where(eq(schema.crmSyncJobs.id, jobId)).returning();

    await logAudit({
      tenantId, userId: job.createdByUserId,
      action: "crm_sync_completed",
      resourceType: "crm_sync",
      resourceId: jobId,
      metadata: { leadId: job.leadId, contactId, companyId, dealId, taskId },
    });

    return updated;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "CRM sync failed";

    const [failed] = await db.update(schema.crmSyncJobs).set({
      syncStatus: "failed",
      hubspotContactId: contactId,
      hubspotCompanyId: companyId,
      hubspotDealId: dealId,
      hubspotTaskId: taskId,
      failureReason: reason,
      updatedAt: new Date(),
    }).where(eq(schema.crmSyncJobs.id, jobId)).returning();

    await logAudit({
      tenantId, userId: job.createdByUserId,
      action: "crm_sync_failed",
      resourceType: "crm_sync",
      resourceId: jobId,
      metadata: { leadId: job.leadId, reason },
    });

    return failed;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

function extractDomain(website: string): string {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}
