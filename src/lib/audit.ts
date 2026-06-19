import { db, schema } from "@/db";

interface AuditParams {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: AuditParams) {
  await db.insert(schema.auditLogs).values({
    tenantId:     params.tenantId   ?? null,
    userId:       params.userId     ?? null,
    action:       params.action,
    resourceType: params.resourceType,
    resourceId:   params.resourceId,
    metadata:     params.metadata ?? null,
  });
}
