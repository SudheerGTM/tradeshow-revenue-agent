import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin, isTenantAdmin, canAssignRole } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/db/schema";

// GET /api/users — platform_admin sees all, others see own tenant
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rows;
  if (isPlatformAdmin(session.user.role)) {
    rows = await db
      .select({
        id:        schema.users.id,
        name:      schema.users.name,
        email:     schema.users.email,
        role:      schema.users.role,
        status:    schema.users.status,
        tenantId:  schema.users.tenantId,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(schema.users.createdAt);
  } else {
    if (!session.user.tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 400 });
    }
    rows = await db
      .select({
        id:        schema.users.id,
        name:      schema.users.name,
        email:     schema.users.email,
        role:      schema.users.role,
        status:    schema.users.status,
        tenantId:  schema.users.tenantId,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.tenantId, session.user.tenantId))
      .orderBy(schema.users.createdAt);
  }

  return NextResponse.json(rows);
}

// POST /api/users — tenant_admin+ can create users within their tenant
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !isTenantAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, tenantId } = body as {
    name: string; email: string; password: string;
    role: UserRole; tenantId?: string;
  };

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: "name, email, password, role are required" }, { status: 400 });
  }

  // Non-platform admins can only create users in their own tenant
  const targetTenantId = isPlatformAdmin(session.user.role)
    ? (tenantId ?? session.user.tenantId)
    : session.user.tenantId;

  if (!targetTenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }

  if (!canAssignRole(session.user.role, role)) {
    return NextResponse.json({ error: `Cannot assign role: ${role}` }, { status: 403 });
  }

  // Unique email check
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing.length) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(schema.users)
    .values({ name, email, passwordHash, role, tenantId: targetTenantId })
    .returning({
      id: schema.users.id, name: schema.users.name,
      email: schema.users.email, role: schema.users.role,
      status: schema.users.status, tenantId: schema.users.tenantId,
    });

  await logAudit({
    tenantId:     targetTenantId,
    userId:       session.user.id,
    action:       "user.created",
    resourceType: "user",
    resourceId:   user.id,
    metadata:     { name, email, role },
  });

  return NextResponse.json(user, { status: 201 });
}
