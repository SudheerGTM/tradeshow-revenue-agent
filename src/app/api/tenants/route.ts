import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// GET /api/tenants — platform_admin only
export async function GET() {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(schema.tenants)
    .orderBy(schema.tenants.createdAt);

  return NextResponse.json(rows);
}

// POST /api/tenants — platform_admin only
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, slug, subdomain, eventName } = body as {
    name: string; slug: string; subdomain: string; eventName?: string;
  };

  if (!name || !slug || !subdomain) {
    return NextResponse.json({ error: "name, slug, subdomain are required" }, { status: 400 });
  }

  const existing = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);

  if (existing.length) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name, slug, subdomain, eventName })
    .returning();

  await logAudit({
    userId:       session.user.id,
    action:       "tenant.created",
    resourceType: "tenant",
    resourceId:   tenant.id,
    metadata:     { name, slug },
  });

  return NextResponse.json(tenant, { status: 201 });
}
