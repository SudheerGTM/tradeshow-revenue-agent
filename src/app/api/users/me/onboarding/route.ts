import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// PATCH /api/users/me/onboarding — { step: number }
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { step } = (await req.json()) as { step: number };
  const clamped = Math.max(0, Math.min(5, step));

  const [updated] = await db
    .update(schema.users)
    .set({
      onboardingStep: clamped,
      ...(clamped >= 5 && { onboardingCompletedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, session.user.id!))
    .returning({ onboardingStep: schema.users.onboardingStep });

  return NextResponse.json(updated);
}
