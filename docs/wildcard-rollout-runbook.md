# Wildcard Multi-Tenant Rollout — Final Runbook

Consolidated, execution-ready runbook for enabling wildcard tenant subdomains. The authentication prerequisite (this runbook's Phase 0) is **done and deployed**. Phases 1–3 (SSL, Nginx, DNS) are **prepared below but not yet executed** — they require explicit go-ahead, and DNS changes require GoDaddy access this session does not have.

## Status as of 2026-06-27

| Phase | Status |
|---|---|
| 0. Tenant-scoped authentication | ✅ **Done** — implemented, deployed to production (`tradeshow-agent:4227970`), regression-tested live |
| 1. Wildcard SSL certificate | ⏳ Prepared, not executed |
| 2. Nginx wildcard config | ⏳ Prepared, not executed |
| 3. GoDaddy wildcard DNS | ⏳ **Explicitly not started** per instruction — do not proceed without separate sign-off |
| 4. Full validation checklist | ⏳ Pending Phases 1–3 |

---

## Phase 0 — Authentication (done)

### What shipped

- `src/lib/tenant.ts`: `resolveTenantSlug()` now correctly distinguishes the apex domain (`tradeshow-agent.gtmtechsol.ai`) from a real tenant subdomain — returns `null` for the former, the subdomain label for the latter. Added `getTenantBySubdomain()`, querying the `tenants.subdomain` column (distinct from `tenants.slug`).
- `src/proxy.ts`: handles the `null` case — no `tenant_slug` cookie forced on the apex.
- `src/lib/auth.ts`: `authorize()` enforces tenant-subdomain matching when a real subdomain is used; preserves legacy email-only login on the apex (since wildcard DNS isn't live, the apex is the only entry point today); `platform_admin` exempt (cross-tenant by design); throws a distinct `TenantNotFoundError` (`code: tenant_not_found`) for unmapped subdomains.
- `src/app/login/page.tsx`: surfaces the distinct tenant-not-found message.

### Commits

- `60561d1` — initial tenant-scoped auth fix (used the wrong column, `slug`)
- `4227970` — correction: use `tenants.subdomain`, not `tenants.slug`

### Deployed as

`tradeshow-agent:4227970`, running in production since 2026-06-27. Previous images retained on the EC2 host for rollback: `tradeshow-agent-prev-60561d1`, `tradeshow-agent-prev-443f011`, `tradeshow-agent-prev-s3fix` (stopped, not deleted).

### Verified (live, against production)

- Apex domain login: ✅ unchanged, still works (`admin@demo.com` via `tradeshow-agent.gtmtechsol.ai`)
- Logout: ✅ session cleared correctly
- Session: ✅ correct `tenantId` populated, dashboard reachable while authenticated
- Real tenant subdomain login (`demo.tradeshow-agent.gtmtechsol.ai`, simulated via `Host` header — no DNS needed for this): ✅ succeeds for the matching tenant's user
- Cross-tenant rejection: ✅ verified locally with known credentials for two distinct tenants (production verification used a deliberately-wrong password as a proxy, since guessing a real second tenant's password against production was avoided — see `docs/tenant-auth-review.md` for why the local test is the authoritative proof of this specific behavior)
- Invalid/unmapped subdomain: ✅ distinct `tenant_not_found` code, verified on both local and production
- Invitation accept / password reset, invalid-token paths: ✅ still correctly return 404 with no regression (verified on production)
- `platform_admin` cross-tenant login: ✅ verified locally

### Rollback (if needed now)

```sh
ssh -i ~/.ssh/tradeshow-agent-key.pem ec2-user@3.73.2.52 "
  sudo docker stop tradeshow-agent && sudo docker rm tradeshow-agent
  sudo docker rename tradeshow-agent-prev-60561d1 tradeshow-agent
  sudo docker start tradeshow-agent
"
curl -s -o /dev/null -w '%{http_code}\n' https://tradeshow-agent.gtmtechsol.ai/login   # expect 200
```
This reverts to the pre-tenant-scoping image (`60561d1`, which still has the column bug — only use this rollback if Phase 0 itself needs reverting, not for later phases). To revert all the way to pre-auth-fix behavior, rename to `tradeshow-agent-prev-443f011` instead.

---

## Phase 1 — Wildcard SSL certificate (prepared, not executed)

Full detail: `docs/wildcard-domain-review.md`. Command, ready to run when approved:

```sh
sudo certbot certonly --manual --preferred-challenges dns \
  -d tradeshow-agent.gtmtechsol.ai \
  -d "*.tradeshow-agent.gtmtechsol.ai" \
  --cert-name tradeshow-agent.gtmtechsol.ai
```

`--cert-name` reuses the existing cert's name so the Nginx config's existing paths keep working without edits. This will prompt for a `_acme-challenge.tradeshow-agent.gtmtechsol.ai` TXT record — must be added in GoDaddy DNS before Certbot can proceed (a DNS change, but a temporary/internal one, not the public-facing wildcard record itself).

**Not executed.** Requires: GoDaddy DNS access (to add the TXT challenge record) and explicit go-ahead.

## Phase 2 — Nginx wildcard config (prepared, not executed)

Full detail and exact diffs: `docs/nginx-wildcard-plan.md`. Summary of the two required edits to `/etc/nginx/conf.d/*.conf`:

1. `server_name tradeshow-agent.gtmtechsol.ai;` → `server_name tradeshow-agent.gtmtechsol.ai *.tradeshow-agent.gtmtechsol.ai;` (both the `:443` and `:80` blocks)
2. The HTTP→HTTPS redirect's `if ($host = tradeshow-agent.gtmtechsol.ai)` → a regex match covering the wildcard, or subdomains on plain HTTP will 404 instead of upgrading.

Validate with `sudo nginx -t` before `sudo systemctl reload nginx` (reload, not restart).

**Not executed.** Low risk to apply once Phase 1's cert exists, but sequenced after it so Nginx never points at a cert that doesn't cover the hostnames it's claiming to serve.

## Phase 3 — GoDaddy wildcard DNS (explicitly not started)

Full detail: `docs/wildcard-domain-review.md`. The record to add, when approved:

```
Type:      A
Host:      *.tradeshow-agent
Points to: 3.73.2.52   (Elastic IP, confirmed static)
TTL:       600
```

**Explicitly gated** — per direct instruction, do not make this change until Phases 1–2 are confirmed working and a separate go-ahead is given. This session also has no GoDaddy credentials configured, so this step cannot be executed from here regardless.

## Phase 4 — Full validation (pending Phases 1–3)

Run the complete checklist in `docs/testing-checklist.md` once DNS is live. The two non-negotiable sign-off items remain:
1. Cross-tenant login attempt on a real public subdomain must fail.
2. At least two distinct real tenant subdomains (not just one) pass the full checklist.

## Overall rollback plan (all phases)

| Phase | Rollback action |
|---|---|
| 0 (auth) | Docker container rename/restart to a previous image tag (see above) — already battle-tested, used twice during this rollout already |
| 1 (SSL) | Original single-domain cert is untouched if `--cert-name` reuse is used as shown; if a new cert name is used instead, simply point Nginx back at the old cert's paths |
| 2 (Nginx) | Keep a copy of the working config (`sudo cp /etc/nginx/conf.d/tradeshow-agent.conf /etc/nginx/conf.d/tradeshow-agent.conf.bak` before editing) — restore and reload if the new config misbehaves |
| 3 (DNS) | Delete the wildcard A record in GoDaddy — propagation delay aside, this is the easiest phase to undo since it's purely additive (apex record untouched) |

## Next step

Phase 0 is complete and stable in production. Awaiting explicit approval to proceed with Phase 1 (SSL) — Phase 3 (DNS) requires both that approval chain *and* separate GoDaddy access this session doesn't have.
