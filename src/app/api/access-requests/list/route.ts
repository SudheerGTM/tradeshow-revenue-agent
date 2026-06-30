import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import type { AccessRequestStatus } from "@/db/schema";

// GET /api/access-requests/list?status=requested — platform admin only
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statusParam = new URL(req.url).searchParams.get("status") as AccessRequestStatus | null;

  const rows = statusParam
    ? await db
        .select()
        .from(schema.tenantAccessRequests)
        .where(eq(schema.tenantAccessRequests.status, statusParam))
        .orderBy(desc(schema.tenantAccessRequests.createdAt))
    : await db
        .select()
        .from(schema.tenantAccessRequests)
        .orderBy(desc(schema.tenantAccessRequests.createdAt));

  return NextResponse.json(rows);
}
