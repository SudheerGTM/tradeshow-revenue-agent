import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";

const MIN_LENGTH = 12;
const HISTORY_LIMIT = 5;

export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < MIN_LENGTH) errors.push(`Must be at least ${MIN_LENGTH} characters`);
  if (!/[A-Z]/.test(password)) errors.push("Must include an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Must include a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Must include a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Must include a special character");
  return { valid: errors.length === 0, errors };
}

/** Checks the new plaintext password against the current hash + last 5 historical hashes. */
export async function isPasswordReused(userId: string, plaintext: string): Promise<boolean> {
  const [user] = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (user && (await bcrypt.compare(plaintext, user.passwordHash))) return true;

  const history = await db
    .select({ passwordHash: schema.passwordHistory.passwordHash })
    .from(schema.passwordHistory)
    .where(eq(schema.passwordHistory.userId, userId))
    .orderBy(desc(schema.passwordHistory.createdAt))
    .limit(HISTORY_LIMIT);

  for (const h of history) {
    if (await bcrypt.compare(plaintext, h.passwordHash)) return true;
  }
  return false;
}

/** Records the password being replaced into history, trimming to the most recent 5. */
export async function recordPasswordHistory(userId: string, oldPasswordHash: string): Promise<void> {
  await db.insert(schema.passwordHistory).values({ userId, passwordHash: oldPasswordHash });

  const rows = await db
    .select({ id: schema.passwordHistory.id })
    .from(schema.passwordHistory)
    .where(eq(schema.passwordHistory.userId, userId))
    .orderBy(desc(schema.passwordHistory.createdAt));

  const stale = rows.slice(HISTORY_LIMIT);
  for (const row of stale) {
    await db.delete(schema.passwordHistory).where(eq(schema.passwordHistory.id, row.id));
  }
}
