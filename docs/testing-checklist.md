# Wildcard Multi-Tenant Testing Checklist

Full validation checklist for the wildcard subdomain rollout. Run after completing `docs/deployment-checklist.md` steps 1–3 (SSL, Nginx, DNS), and again after the `authorize()` tenant-scoping fix is live.

## Tenant resolution

- [ ] `demo.tradeshow-agent.gtmtechsol.ai` loads the login page (200, correct branding)
- [ ] A second real tenant subdomain (e.g. `alpi.tradeshow-agent.gtmtechsol.ai`) loads the login page
- [ ] A third real tenant subdomain (e.g. `carousel.tradeshow-agent.gtmtechsol.ai`) loads the login page
- [ ] `invalidtenant.tradeshow-agent.gtmtechsol.ai` — confirm what actually happens (per `docs/tenant-auth-review.md`, current `resolveTenantSlug` has no explicit "not found" handling at the proxy layer; verify whether this surfaces as a graceful error page, a fallback to `demo`, or an unhandled error — and fix if it's the latter two before relying on this in front of real customers)
- [ ] `tradeshow-agent.gtmtechsol.ai` (apex, no subdomain) still works exactly as before — should resolve to the `demo` fallback per `resolveTenantSlug`

## Authentication

- [ ] Login on `demo.tradeshow-agent.gtmtechsol.ai` with a `demo`-tenant user succeeds
- [ ] **Critical:** attempt login on `demo.tradeshow-agent.gtmtechsol.ai` using a different tenant's valid credentials (e.g. an `alpi` user) — after the `authorize()` fix (`docs/tenant-auth-review.md` §2), this **must fail**. If it succeeds, the fix wasn't applied or didn't work — do not consider this rollout complete.
- [ ] Logout from a tenant subdomain returns to that same subdomain's `/login`, not the apex
- [ ] Session persists across page navigations within the same tenant subdomain
- [ ] Session does **not** carry over between two different tenant subdomains (open `demo.*` and `alpi.*` in separate tabs, confirm they require independent logins)
- [ ] Redirect after successful login lands on `/dashboard` on the **same subdomain** the login happened on

## Password reset & invitations

- [ ] Request a password reset for a `demo` tenant user — confirm email is sent (or, given SES sandbox mode per `docs/12-environment-variables.md`, confirm it's at least logged/attempted correctly in non-sandbox-capable test conditions)
- [ ] Open the reset link — confirm it works regardless of which subdomain it's opened from (token-based, should be host-independent per `docs/tenant-auth-review.md` §3)
- [ ] Complete the reset, confirm new password works for login on the correct tenant subdomain
- [ ] Send an invitation to a new user for a specific tenant
- [ ] Accept the invitation via the emailed link — confirm the created account is bound to the correct tenant regardless of which host the accept page was opened on

## Tenant isolation (data, not just auth)

- [ ] Logged into `demo.*`, confirm only `demo` tenant's leads/events/users are visible anywhere in the UI
- [ ] Repeat for a second tenant subdomain, confirm no cross-tenant data appears
- [ ] Attempt a direct API call (e.g. `/api/leads?eventId=<some-other-tenant's-event-id>`) while authenticated as a different tenant — should be blocked/empty per existing tenant-scoping in API routes (per `docs/security-review.md`, this was already spot-checked as correctly tenant-scoped; re-verify specifically through a real subdomain rather than just the apex)

## SSL

- [ ] No browser certificate warning on `demo.tradeshow-agent.gtmtechsol.ai`
- [ ] No browser certificate warning on at least one other real tenant subdomain
- [ ] No browser certificate warning on the apex domain (regression check — confirm the new wildcard cert didn't break the existing apex coverage)
- [ ] `openssl s_client -connect demo.tradeshow-agent.gtmtechsol.ai:443 -servername demo.tradeshow-agent.gtmtechsol.ai` shows the wildcard cert with the expected SANs

## API routes / feature spot-checks (per-tenant, via subdomain)

These exercise the existing tenant-scoping that already works off `session.user.tenantId` (not the subdomain directly) — the goal here is confirming nothing in the request pipeline (proxy, Nginx, cookies) breaks these when accessed via a subdomain rather than the apex.

- [ ] Create a lead while on a tenant subdomain — confirm it's attributed to the correct tenant
- [ ] CRM sync prepare→approve flow works end-to-end on a tenant subdomain
- [ ] Voice note upload (S3) works on a tenant subdomain — confirms presigned URL generation/redirects aren't accidentally tied to the apex hostname
- [ ] Business card OCR capture works on a tenant subdomain
- [ ] File/avatar upload works on a tenant subdomain

## Regression check — apex domain unaffected

- [ ] Full smoke test of `tradeshow-agent.gtmtechsol.ai` (no subdomain) after all changes — login, dashboard, lead creation — confirms the wildcard rollout didn't regress the existing production entry point that real users/tenants may already be using via the apex.

## Sign-off

Do not consider this rollout complete until:
1. The cross-tenant login attempt test (Authentication section, "Critical" item) has been explicitly run and confirmed to fail as expected.
2. At least two distinct real tenant subdomains pass the full checklist above, not just `demo`.
3. The apex-domain regression check passes.
