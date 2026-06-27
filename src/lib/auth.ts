import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { resolveTenantSlug, getTenantBySubdomain } from "@/lib/tenant";

const MAX_FAILED_ATTEMPTS = 5;

// Thrown when the subdomain a login was attempted on doesn't map to any
// known tenant — distinct from "wrong email/password" so the client can
// tell a configuration/link problem apart from a credentials mistake.
export class TenantNotFoundError extends CredentialsSignin {
  code = "tenant_not_found";
}

// Future SSO/SAML providers (Google, Entra ID, Okta) would be added to this
// `providers` array as additional entries — not implemented in this release.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        // null on the apex domain / localhost (no tenant subdomain in use
        // yet) — preserves today's tenant-agnostic-by-email login behavior.
        // Non-null means a real tenant subdomain was used and must resolve
        // to a real tenant, or the login attempt is rejected outright.
        const hostname = request.headers.get("host") ?? "";
        const slug = resolveTenantSlug(hostname);
        const tenant = slug ? await getTenantBySubdomain(slug) : null;
        if (slug && !tenant) {
          throw new TenantNotFoundError();
        }

        const rows = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, credentials.email as string))
          .limit(1);

        const user = rows[0];
        if (!user) return null;

        // platform_admin accounts are cross-tenant (tenantId is null) and may
        // log in from any tenant's subdomain. Every other role, when a real
        // tenant subdomain is in use, must belong to that exact tenant —
        // otherwise a valid email/password for a *different* tenant would
        // still succeed here.
        if (tenant && user.role !== "platform_admin" && user.tenantId !== tenant.id) {
          return null;
        }

        if (user.status === "suspended" || user.status === "locked" || user.status === "invited" || user.status === "inactive") {
          return null;
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
          await db
            .update(schema.users)
            .set({
              failedLoginAttempts: attempts,
              ...(lockingOut && { status: "locked", lockedAt: new Date() }),
              updatedAt: new Date(),
            })
            .where(eq(schema.users.id, user.id));

          if (lockingOut) {
            await logAudit({
              tenantId: user.tenantId,
              userId: user.id,
              action: "user_locked",
              resourceType: "user",
              resourceId: user.id,
              metadata: { reason: "max_failed_login_attempts" },
            });
          }
          return null;
        }

        await db
          .update(schema.users)
          .set({
            failedLoginAttempts: 0,
            lastLoginAt: new Date(),
            lastActivityAt: new Date(),
            sessionCount: user.sessionCount + 1,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, user.id));

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id       = (user as { id?: string }).id;
        token.role     = (user as { role?: string }).role;
        token.tenantId = (user as { tenantId?: string }).tenantId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id       = token.id       as string;
      session.user.role     = token.role     as string;
      session.user.tenantId = token.tenantId as string | undefined;
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
});
