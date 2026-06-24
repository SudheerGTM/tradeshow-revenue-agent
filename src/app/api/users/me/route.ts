import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantById } from "@/lib/tenant";
import { getAccessibleEventIds } from "@/lib/event-access";
import { generatePresignedDownloadUrl } from "@/lib/aws/s3";
import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";

// GET /api/users/me — current user's profile
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id!)).limit(1);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tenant = user.tenantId ? await getTenantById(user.tenantId) : null;
  const eventIds = await getAccessibleEventIds(user.id, user.allEvents);
  const events = eventIds && eventIds.length
    ? await db.select({ name: schema.events.name }).from(schema.events).where(inArray(schema.events.id, eventIds))
    : [];

  const avatarDisplayUrl = user.avatarUrl ? await generatePresignedDownloadUrl(user.avatarUrl) : null;

  return NextResponse.json({
    id: user.id, name: user.name, email: user.email, role: user.role,
    tenantName: tenant?.name ?? null,
    lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
    allEvents: user.allEvents, eventNames: events.map((e) => e.name),
    avatarDisplayUrl,
    onboardingStep: user.onboardingStep,
  });
}

// PATCH /api/users/me — update own name
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, avatarUrl } = (await req.json()) as { name?: string; avatarUrl?: string };

  const [updated] = await db
    .update(schema.users)
    .set({
      ...(name && { name }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, session.user.id!))
    .returning({ id: schema.users.id, name: schema.users.name, avatarUrl: schema.users.avatarUrl });

  return NextResponse.json(updated);
}
