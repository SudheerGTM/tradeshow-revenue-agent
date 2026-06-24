import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { emailProvider, passwordResetEmail } from "@/lib/email";

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// POST /api/auth/forgot-password — public, always returns 200 (no email enumeration)
export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email: string };

  if (email) {
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    const user = rows[0];
    if (user && user.status !== "suspended" && user.status !== "locked" && user.status !== "invited") {
      const token = crypto.randomBytes(32).toString("hex");
      await db.insert(schema.passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + EXPIRY_MS),
      });

      const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
      await emailProvider.send(
        passwordResetEmail({ to: user.email, firstName: user.name.split(" ")[0] || user.name, resetUrl })
      ).catch((err) => console.error("[forgot-password] failed to send email:", err));
    }
  }

  return NextResponse.json({ success: true });
}
