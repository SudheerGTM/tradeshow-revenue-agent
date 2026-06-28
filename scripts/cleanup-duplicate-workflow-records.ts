/**
 * Release 13.7.1 cleanup utility — for duplicate business objects created
 * by repeated workflow execution BEFORE this release's idempotency fixes
 * were deployed. Safe to run multiple times (idempotent itself).
 *
 * Does NOT delete anything. For each duplicate group it keeps the most
 * recently updated row as the active one and, where an honest status value
 * exists for "no longer active", reassigns the older duplicates to it.
 * Where no such status exists, it only reports — it does not guess.
 *
 * Usage:
 *   npx tsx scripts/cleanup-duplicate-workflow-records.ts [--dry-run] [--tenant <tenantId>]
 *
 * --dry-run prints what would change without writing anything. Always run
 * with --dry-run first and review the output before running for real.
 */
import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");
const tenantArgIdx = process.argv.indexOf("--tenant");
const TENANT_FILTER = tenantArgIdx !== -1 ? process.argv[tenantArgIdx + 1] : null;

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE — will write changes"}`);
  if (TENANT_FILTER) console.log(`Scoped to tenant: ${TENANT_FILTER}`);

  await cleanupFollowups();
  await cleanupOpportunities();
  await reportCrmSyncDuplicates();

  console.log("\nDone.");
}

// ─── Follow-ups: multiple "draft" rows per lead+type → keep latest, mark
// older ones "rejected" (the closest honest existing status for "this draft
// is no longer the one to act on" — it is not approved, and leaving it as
// "draft" is exactly the bug being cleaned up).
async function cleanupFollowups() {
  console.log("\n=== Follow-up recommendations: duplicate active drafts ===");
  const condition = TENANT_FILTER
    ? and(eq(schema.followupRecommendations.status, "draft"), eq(schema.followupRecommendations.tenantId, TENANT_FILTER))
    : eq(schema.followupRecommendations.status, "draft");

  const drafts = await db.select({
    id: schema.followupRecommendations.id,
    tenantId: schema.followupRecommendations.tenantId,
    leadId: schema.followupRecommendations.leadId,
    followupType: schema.followupRecommendations.followupType,
    createdAt: schema.followupRecommendations.createdAt,
  }).from(schema.followupRecommendations).where(condition);

  const groups = new Map<string, typeof drafts>();
  for (const d of drafts) {
    const key = `${d.tenantId}:${d.leadId}:${d.followupType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  let duplicateGroups = 0, rowsToSupersede = 0;
  for (const [key, rows] of groups) {
    if (rows.length <= 1) continue;
    duplicateGroups++;
    const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const [keep, ...stale] = sorted;
    rowsToSupersede += stale.length;
    console.log(`  ${key}: keeping ${keep.id} (newest), superseding ${stale.length} older draft(s)`);
    if (!DRY_RUN) {
      for (const s of stale) {
        await db.update(schema.followupRecommendations)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(eq(schema.followupRecommendations.id, s.id));
      }
    }
  }
  console.log(`Groups with duplicates: ${duplicateGroups}, rows ${DRY_RUN ? "that would be" : ""} superseded: ${rowsToSupersede}`);
}

// ─── Opportunities: multiple "active" rows per lead → keep the one with the
// most pipeline progress (highest stage_rank, tie-broken by most recently
// updated), archive the rest. "archived" is an existing, honest status for
// exactly this ("no longer the active opportunity, but not won/lost either").
const STAGE_RANK: Record<string, number> = {
  identified: 0, qualified: 1, meeting_scheduled: 2, proposal_requested: 3,
  proposal_sent: 4, negotiation: 5, won: 6, lost: 6,
};

async function cleanupOpportunities() {
  console.log("\n=== Opportunities: duplicate active records per lead ===");
  const condition = TENANT_FILTER
    ? and(eq(schema.opportunities.status, "active"), eq(schema.opportunities.tenantId, TENANT_FILTER))
    : eq(schema.opportunities.status, "active");

  const opps = await db.select({
    id: schema.opportunities.id,
    tenantId: schema.opportunities.tenantId,
    leadId: schema.opportunities.leadId,
    stage: schema.opportunities.stage,
    updatedAt: schema.opportunities.updatedAt,
  }).from(schema.opportunities).where(condition);

  const groups = new Map<string, typeof opps>();
  for (const o of opps) {
    const key = `${o.tenantId}:${o.leadId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  let duplicateGroups = 0, rowsToArchive = 0;
  for (const [key, rows] of groups) {
    if (rows.length <= 1) continue;
    duplicateGroups++;
    const sorted = [...rows].sort((a, b) => {
      const rankDiff = (STAGE_RANK[b.stage] ?? 0) - (STAGE_RANK[a.stage] ?? 0);
      if (rankDiff !== 0) return rankDiff;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
    const [keep, ...stale] = sorted;
    rowsToArchive += stale.length;
    console.log(`  ${key}: keeping ${keep.id} (stage=${keep.stage}), archiving ${stale.length} duplicate(s)`);
    if (!DRY_RUN) {
      for (const s of stale) {
        await db.update(schema.opportunities)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(schema.opportunities.id, s.id));
      }
    }
  }
  console.log(`Groups with duplicates: ${duplicateGroups}, rows ${DRY_RUN ? "that would be" : ""} archived: ${rowsToArchive}`);
}

// ─── CRM sync jobs: report only. crm_sync_status has no honest value for
// "superseded duplicate" (pending_approval / approved / queued / processing
// / completed / failed) — marking a never-actually-failed duplicate as
// "failed" would misrepresent what happened. This needs either a manual
// per-row decision or a future schema addition; this script does not guess.
async function reportCrmSyncDuplicates() {
  console.log("\n=== CRM sync jobs: duplicate pending_approval jobs (report only, not modified) ===");
  const condition = TENANT_FILTER
    ? and(eq(schema.crmSyncJobs.syncStatus, "pending_approval"), eq(schema.crmSyncJobs.tenantId, TENANT_FILTER))
    : eq(schema.crmSyncJobs.syncStatus, "pending_approval");

  const rows = await db.select({
    tenantId: schema.crmSyncJobs.tenantId, leadId: schema.crmSyncJobs.leadId,
    syncType: schema.crmSyncJobs.syncType, count: sql<number>`count(*)::int`,
  }).from(schema.crmSyncJobs).where(condition)
    .groupBy(schema.crmSyncJobs.tenantId, schema.crmSyncJobs.leadId, schema.crmSyncJobs.syncType)
    .having(sql`count(*) > 1`);

  if (!rows.length) {
    console.log("  None found.");
    return;
  }
  for (const r of rows) {
    console.log(`  tenant=${r.tenantId} lead=${r.leadId} syncType=${r.syncType}: ${r.count} pending_approval jobs — needs manual review (approve the correct one, cancel/ignore the rest via the UI)`);
  }
  console.log(`Total duplicate groups found: ${rows.length}. Not modified — see comment above for why.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
