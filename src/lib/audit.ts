import { db, schema } from "@/db";
import type { NextRequest } from "next/server";

interface AuditParams {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

type DbOrTx = Pick<typeof db, "insert">;

// Accepts an optional transaction client so the audit write can be part of
// the same atomic transaction as the business-object write it documents (see
// Release 13.7.1 — a job/draft/opportunity write and its audit log entry
// should commit or roll back together).
export async function logAudit(params: AuditParams, dbClient: DbOrTx = db) {
  await dbClient.insert(schema.auditLogs).values({
    tenantId:     params.tenantId   ?? null,
    userId:       params.userId     ?? null,
    action:       params.action,
    resourceType: params.resourceType,
    resourceId:   params.resourceId,
    metadata:     params.metadata ?? null,
    ipAddress:    params.ipAddress ?? null,
  });
}

/** Best-effort client IP extraction — Nginx forwards the real client IP via X-Forwarded-For. */
export function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return null;
}
