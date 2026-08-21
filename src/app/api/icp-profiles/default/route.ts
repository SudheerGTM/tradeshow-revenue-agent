import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit, getRequestIp } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { setTenantDefaultICP, ICPTenantMismatchError } from "@/lib/icp/icp-resolver";

// PATCH /api/icp-profiles/default — set (or clear, with icpProfileId: null)
// the tenant's explicit Default ICP. tenant_admin only. This is a dedicated,
// narrowly-scoped route rather than reusing PATCH /api/tenants/:id (which is
// platform_admin-only and manages cross-tenant records) — keeps ICP
// ownership with the tenant_admin role, matching the R14.3 approval.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.user.tenantId;
  const body = await req.json();
  const { icpProfileId } = body as { icpProfileId?: string | null };

  try {
    await setTenantDefaultICP(tenantId, icpProfileId ?? null);
  } catch (err) {
    if (err instanceof ICPTenantMismatchError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: "icp_default_changed",
    resourceType: "tenant",
    resourceId: tenantId,
    metadata: { icpProfileId: icpProfileId ?? null },
    ipAddress: getRequestIp(req),
  });

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  return NextResponse.json({ defaultIcpProfileId: tenant?.defaultIcpProfileId ?? null });
}
