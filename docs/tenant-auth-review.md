# Tenant Resolution & Authentication Review

Inspection only — no code changes made. This is the most important of the five review documents: it identifies a real security gap that should be fixed **before** wildcard subdomains go live publicly.

## 1. Tenant resolution — current implementation

Tenant detection is based on **subdomain, via the Host header** — and it already exists and is wired in.

This codebase is a customized Next.js fork (see root `AGENTS.md`: "this is NOT the Next.js you know"). Its middleware equivalent is [src/proxy.ts](../src/proxy.ts), not the standard `middleware.ts` — this is why an earlier review pass (`docs/security-review.md`) incorrectly reported "no middleware.ts" as a gap. That finding is superseded by this one: an edge-layer gate does exist, just under this fork's renamed convention.

```ts
// src/proxy.ts
export function proxy(req: NextRequest) {
  const hostname = req.headers.get("host") ?? "localhost";
  const slug = resolveTenantSlug(hostname);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.set("tenant_slug", slug, { httpOnly: true, sameSite: "lax" });
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

```ts
// src/lib/tenant.ts
export function resolveTenantSlug(hostname: string): string {
  if (hostname.startsWith("localhost") || hostname.startsWith("127.")) return "demo";
  const parts = hostname.split(".");
  return parts.length >= 3 ? parts[0] : "demo";
}
```

This runs on every request (matcher excludes only static assets) and correctly derives `"demo"` from `demo.tradeshow-agent.gtmtechsol.ai`, setting both an `x-tenant-slug` request header and a `tenant_slug` httpOnly cookie.

**Not based on:** URL path or an environment variable — confirmed by reading the function; it only inspects the `Host` header.

## 2. The critical gap: tenant detection is not connected to authentication

`resolveTenantSlug` runs and sets `tenant_slug`/`x-tenant-slug` on every request — but **`authorize()` in `src/lib/auth.ts` never reads either of them.**

```ts
// src/lib/auth.ts — authorize()
const rows = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, credentials.email as string))   // ← no tenant filter
  .limit(1);
```

Login is currently scoped by **email uniqueness alone**, globally across all tenants. Today (single production domain, no subdomains live) this is invisible — there's only one host to log in from. The moment wildcard subdomains go live, this becomes a real tenant-isolation problem:

> A user with valid credentials can authenticate from **any** tenant's subdomain — `alpi.tradeshow-agent.gtmtechsol.ai`, `carousel.tradeshow-agent.gtmtechsol.ai`, etc. — and will simply be logged into *their own* tenant (via `session.user.tenantId`, set from the DB row, not from the subdomain), regardless of which subdomain the login form was served from.

This isn't a data leak by itself (the user only ever sees their own tenant's data after login, since every downstream query filters by `session.user.tenantId` — confirmed in `docs/security-review.md`'s tenant-isolation spot check), but it is **misleading and not true tenant-scoped authentication**: a user could log into `demo.tradeshow-agent.gtmtechsol.ai` with `alpi` tenant credentials and land in the `alpi` dashboard while the URL still says `demo`. That breaks the "Lookup user inside demo tenant" expectation in the brief, and would confuse support/audit trails (which subdomain was actually used vs which tenant was actually accessed).

### Update (2026-06-27): implemented, deployed, and verified

The fix described below has since been implemented in `src/lib/auth.ts`, deployed to production, and verified — see `docs/08-multi-tenant-architecture.md`'s "Subdomain strategy" section for the final design and `docs/deployment-checklist.md` for the rollout record. Two things changed from the original plan during implementation, both caught by testing before being considered done:

1. **`resolveTenantSlug()` itself had a bug** that the original plan didn't anticipate: its label-counting heuristic treated the apex domain (`tradeshow-agent.gtmtechsol.ai`, itself 3 labels) as a tenant subdomain, resolving to a fake slug. Fixed to compare against the actual root domain — apex/localhost now correctly resolve to `null` (no tenant context, preserving legacy login), only real subdomains resolve to a label.
2. **Wrong column initially used for the lookup**: the `tenants` table has both a `slug` column (e.g. `"demo-logistics"`, used elsewhere as a general identifier) and a separate `subdomain` column (e.g. `"demo"`) — the one actually intended for subdomain routing. The first implementation pass used `getTenantBySlug()`, which would have made the literal example used throughout this review (`demo.tradeshow-agent.gtmtechsol.ai`) fail with `tenant_not_found`, since no tenant has `slug = "demo"`. Added `getTenantBySubdomain()` and switched to it before deploying.

Final implementation, for reference:

```ts
async authorize(credentials, request) {
  const hostname = request.headers.get("host") ?? "";
  const slug = resolveTenantSlug(hostname);              // null on apex/localhost
  const tenant = slug ? await getTenantBySubdomain(slug) : null;
  if (slug && !tenant) throw new TenantNotFoundError();   // code: "tenant_not_found"
  // ...user lookup by email...
  if (tenant && user.role !== "platform_admin" && user.tenantId !== tenant.id) {
    return null; // valid credentials, wrong tenant — generic invalid-credentials error
  }
```

This is a small, well-contained change — but it is a **behavior change to the authentication flow**, which is explicitly out of scope for this review-only pass. Flagging it here as the top blocker to resolve before (or immediately after, with a tight rollout window) enabling wildcard DNS publicly.

## 3. Login / logout / session / cookies — verified flows

| Flow | Finding |
|---|---|
| **Login** | `signIn("credentials", { email, password, redirect: false })` in `src/app/login/page.tsx`, then client-side `router.push("/dashboard")` on success. Relative path — stays on whatever host the user is currently on. No issue for subdomains. |
| **Logout** | `signOut({ callbackUrl: "/login" })` in `src/components/TopBar.tsx:42`. Relative `callbackUrl` — resolves against current origin, returns to `/login` on the same subdomain. No issue. |
| **Session** | JWT strategy (`session: { strategy: "jwt" }`), no server-side session store. `session.user.tenantId` is set from the DB user row in the `jwt`/`session` callbacks — independent of which host the session cookie happens to be readable on. |
| **Cookies** | No `cookies: { ... domain: ... }` override found in `auth.ts` — NextAuth defaults to scoping the session cookie to the **exact host** that set it. This means a session created on `demo.tradeshow-agent.gtmtechsol.ai` will **not** be readable on `alpi.tradeshow-agent.gtmtechsol.ai` — each subdomain gets an independent login. This is almost certainly the **correct** behavior for tenant isolation and requires **no change** — recommend explicitly *not* setting a shared cookie domain (e.g. `.tradeshow-agent.gtmtechsol.ai`), which would allow a session to leak across tenant subdomains. |
| **Password reset** | Token-based only (`src/app/api/auth/reset-password/route.ts`) — looks up `password_reset_tokens` by token, with no host/tenant check at all. Safe regardless of which subdomain the link is opened from. |
| **Invitation links** | Same pattern — token-based (`src/app/api/invitations/accept/route.ts`), no host/tenant dependency. Safe regardless of subdomain. |

**Conclusion on auth flows other than login:** logout, session, cookies, password reset, and invitation acceptance all require **no changes** for wildcard subdomains — they're either relative-path-based or purely token-based and already host-independent. Only the credentials `authorize()` path needs the fix described above.

## 4. Email link host — a related but separate gap

Both password-reset and invitation emails build their links from a single static `NEXTAUTH_URL`:

```ts
// src/app/api/auth/forgot-password/route.ts
const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
// src/app/api/invitations/route.ts
const inviteUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/invite/${token}`;
```

This means **every** reset/invitation email links back to the apex domain (`tradeshow-agent.gtmtechsol.ai`), never to the recipient's actual tenant subdomain. This is **not a security problem** (the token carries the tenant binding server-side, not the URL), but it is a cosmetic/UX inconsistency once subdomains are tenant-visible in the browser — a `carousel` tenant user would click a link that opens on the apex domain rather than `carousel.tradeshow-agent.gtmtechsol.ai`. Since the reset/accept pages are token-driven and don't depend on the resolved tenant slug to function, **this is optional to fix**, not a blocker. If desired later: build the link from the invited/reset user's actual tenant slug instead of a static env var.

## 5. Environment variables — what needs review

| Variable | Current state | Needs change for wildcard subdomains? |
|---|---|---|
| `NEXTAUTH_URL` | Single static URL (apex domain) | No change required for auth/session to function; affects only the cosmetic email-link issue above |
| `trustHost` (in `auth.ts`, not an env var but related) | Already `true` | No change — this is exactly what allows Auth.js to accept requests from a host other than `NEXTAUTH_URL` without throwing `UntrustedHost` (see `docs/16-troubleshooting.md`) |
| `COOKIE_DOMAIN` | Does not exist in this codebase — no env var or code reads it | Confirmed via repo-wide grep. Do not introduce one — see cookie finding above; per-subdomain-isolated cookies are correct, a shared cookie domain would be a regression |
| `APP_URL` / `BASE_URL` | Do not exist in this codebase | Confirmed via repo-wide grep — no action needed, the codebase uses `NEXTAUTH_URL` exclusively for this purpose |

**Conclusion:** no environment variable changes are required to enable wildcard subdomains, beyond optionally addressing the cosmetic email-link issue in item 4.

## Summary of required vs optional changes

| Change | Required before going live? | Risk if skipped |
|---|---|---|
| Tenant-scope `authorize()` by resolved subdomain | **Yes — recommended blocker** | Login works "by accident" but doesn't actually enforce subdomain = tenant; misleading audit trail, confusing UX, not a data leak per se but not real tenant-scoped auth either |
| Leave cookies host-scoped (no `COOKIE_DOMAIN`) | Already correct, no action needed | N/A |
| Leave password-reset/invitation token flows as-is | Already correct, no action needed | N/A |
| Make reset/invitation email links tenant-aware | Optional, cosmetic | Minor UX inconsistency only |
