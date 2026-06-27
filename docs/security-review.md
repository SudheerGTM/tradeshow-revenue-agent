# Security Review

Findings from direct code inspection (grep across `src/`, config files, and the deployed bundle). Cross-reference with `docs/07-authentication-security.md` and `docs/08-multi-tenant-architecture.md`, which remain the canonical description of the *intended* security model — this doc focuses on gaps and risks found against that model, classified by severity.

## Critical

None found.

## High

### No security headers configured (CSP, X-Frame-Options, HSTS, etc.)

`next.config.ts` sets only `output: "standalone"` — no `headers()` function, no CSP, no `X-Frame-Options`, no `Strict-Transport-Security`, no `X-Content-Type-Options`. Next.js does not set these by default.

- **Impact:** the app has no defense-in-depth against clickjacking (no frame-busting header) or MIME-sniffing attacks, and no CSP to limit blast radius if an XSS vector is ever introduced (none found currently, but CSP is the safety net for that class of bug, not a substitute for input/output sanitization).
- **Recommendation:** add a `headers()` block in `next.config.ts` (or `middleware.ts`) setting at minimum `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (HTTPS is already terminated at Nginx, confirm it forwards correctly), and a baseline CSP.
- **Effort:** Low (a few hours, plus testing that no inline scripts/styles break under CSP).

### No request body schema validation library

No `zod`/`yup`/`joi` (or equivalent) is in `package.json`. API routes parse `await req.json()` and immediately **type-cast** the result (`body as { firstName: string; ... }`) rather than runtime-validating it — e.g. `src/app/api/leads/route.ts:124-135`. A handful of fields get manual `if (!x) return 400` checks afterward, but most fields (notes, phone, country, qrRawText, etc.) flow through with no type or length validation at runtime — the TypeScript cast is compile-time only and provides zero protection against a malicious or malformed request body.

- **Impact:** Medium-High. Not directly exploitable for injection (Drizzle's parameterized queries protect against SQL injection regardless — see below), but allows oversized payloads, wrong types reaching the DB layer (likely to throw a DB-level error rather than silently corrupt data, given Postgres column types), and is a maintainability/defense-in-depth gap.
- **Recommendation:** introduce `zod` (or similar) for all `POST`/`PATCH` route bodies, starting with the highest-traffic/highest-sensitivity routes (`/api/leads`, `/api/users`, `/api/invitations`). This is exactly the kind of "harden before Release 14" work this release is meant to cover.
- **Effort:** Medium — one schema per route, incremental, low risk if done route-by-route with tests.

### No rate limiting beyond login lockout

Confirmed via grep: no rate-limiting middleware or library anywhere in `src/`. `docs/07-authentication-security.md` already documents this as a known gap ("No rate limiting exists on any API route beyond the 5-attempt login lockout"). Independently re-verified here, not yet fixed.

- **Impact:** any unauthenticated or authenticated endpoint (e.g. `/api/leads`, search/list endpoints, invitation-accept) can be hammered without throttling. The login lockout limits credential-stuffing on `/api/auth/*` specifically, but nothing protects other routes from scripted abuse or accidental client bugs causing request storms.
- **Recommendation:** add a rate-limiting layer (e.g. `@upstash/ratelimit` if Redis/Upstash is introduced, or a simple in-memory/IP-based limiter at the Nginx layer given the single-instance EC2 deployment). Nginx-level rate limiting (`limit_req`) is the lowest-effort option given the current infra and doesn't require an app-code change.
- **Effort:** Low (Nginx-level) to Medium (app-level with a store).

## Medium

### Correction (2026-06-27): edge-layer gate exists, under this fork's renamed convention

An earlier pass of this review reported "no `middleware.ts` — auth/security checks are per-route, not centralized" as a Medium finding. **That finding is incorrect and is retracted here.**

This codebase is a customized Next.js fork (root `AGENTS.md`: "this is NOT the Next.js you know — APIs, conventions, and file structure may all differ from your training data"). Its middleware equivalent is [src/proxy.ts](../src/proxy.ts), not `middleware.ts` — confirmed present, exporting a `proxy()` function with the standard `config.matcher` shape, running on every request except static assets. It currently handles tenant-slug resolution (see `docs/tenant-auth-review.md`) but not auth enforcement.

The underlying observation still has some validity, restated accurately: `src/proxy.ts` does **not** currently enforce authentication centrally — each API route still independently calls `await auth()`. So the "no centralized auth backstop" recommendation stands, just not the "no middleware file exists at all" premise. Recommendation unchanged: consider adding an auth check inside `proxy.ts` as a backstop for `/api/*` and `(app)/*` paths, while routes keep their own fine-grained tenant/role checks. Not urgent — current routes were checked and are consistent — but worth doing before the route count grows further.

### Sensitive logging — not found, but no enforced policy

No instances of `console.log`/`console.error` printing `password`, `token`, or `secret` were found in `src/`. This is good, but it's currently true by convention/luck, not by any lint rule or code-review gate. Given audit logs already capture an `ipAddress` and rich metadata per `docs/07-authentication-security.md`, it's worth explicitly confirming `audit_logs.metadata` payloads never include a raw password or token (not separately verified in this pass — recommend a follow-up grep through `src/lib/audit.ts` call sites specifically before any major audit-logging changes).

### S3 / presigned URLs — no public ACLs, expiry is reasonable

`src/lib/aws/s3.ts` uses `getSignedUrl` with explicit `expiresIn` (600s for one path, 3600s for another) and no `public-read` ACL or bucket-policy grants were found in code. This matches secure practice — flagging as a positive finding, not a gap, so it's documented rather than silently assumed.

## Low / Informational

- **SQL injection:** not found. All `sql\`...\`` template usage inspected uses Drizzle's parameterized column references (e.g. `` sql`CASE ${schema.followupRecommendations.priority} WHEN ...` `` ) — no string-concatenated or `sql.raw()` user input found anywhere in `src/`.
- **XSS:** no `dangerouslySetInnerHTML` usage found anywhere in `src/`. React's default escaping is relied on and not bypassed.
- **CSRF:** relies on NextAuth's built-in CSRF protection on the credentials callback, as already documented in `07-authentication-security.md`. Not independently re-derived here; flagged as an assumption worth periodically re-verifying against the NextAuth version in use after upgrades.
- **Tenant isolation:** spot-checked `src/app/api/leads/route.ts` — every query is scoped by `tenantId` from the session, and `booth_user` gets an additional `createdByUserId` filter. Matches the documented model in `08-multi-tenant-architecture.md`. Not exhaustively re-verified across every route in this pass (would require Priority 2's full repo inspection); no contradicting evidence found in the routes sampled.
- **Secrets in env vars:** `.env.local`/`.env.production` are gitignored and not committed (verified no `.env*` files tracked in `git ls-files`). AWS credentials in production come from the EC2 instance role, not static keys (confirmed in `docs/production-gap-analysis.md`).
- **CORS:** no `Access-Control-Allow-*` headers set anywhere — meaning the default same-origin-only behavior applies. Appropriate for this app (no public API consumers), flagged as a non-issue.

## Summary Table

| Issue | Severity | Effort | Recommend fixing before Release 14? |
|---|---|---|---|
| No security headers (CSP, X-Frame-Options, etc.) | High | Low | Yes |
| No runtime body validation (zod or equivalent) | High | Medium | Yes, incrementally |
| No rate limiting beyond login lockout | High | Low (Nginx) | Yes, at least Nginx-level |
| No centralized `middleware.ts` auth backstop | Medium | Low-Medium | Optional, not urgent |
| Audit log metadata not explicitly verified secret-free | Medium | Low (verification only) | Yes, quick check |
| SQL injection / XSS / CSRF / tenant isolation / S3 ACLs / CORS | None found | — | — |
