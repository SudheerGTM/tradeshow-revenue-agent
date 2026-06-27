# Wildcard Multi-Tenant Deployment Checklist

Production safety checklist for enabling wildcard tenant subdomains. This is a sequencing plan, not yet executed — see `docs/wildcard-domain-review.md`, `docs/nginx-wildcard-plan.md`, and `docs/tenant-auth-review.md` for the detailed findings behind each step.

## Recommended order (do not skip ahead)

Sequencing matters here specifically to avoid a window where DNS resolves but SSL/Nginx/auth aren't ready, which would expose a broken or insecure state publicly.

### Step 0 — Pre-flight (no infra changes)

- [ ] Fix `authorize()` in `src/lib/auth.ts` to scope login by resolved tenant slug (see `docs/tenant-auth-review.md` §2). **Do this first**, while still single-domain — it's testable today without any DNS/SSL changes, and closes the gap before subdomains make it visible.
- [ ] Confirm rollback path for this code change (git revert / redeploy previous image tag) before merging.
- [ ] Decide now whether reset/invitation email links should become tenant-aware (optional, cosmetic — see `docs/tenant-auth-review.md` §4). Not a blocker either way.

### Step 1 — SSL certificate (before DNS goes live)

- [ ] Issue wildcard cert via Certbot DNS-01 challenge (`docs/wildcard-domain-review.md`) — requires creating a `_acme-challenge` TXT record in GoDaddy temporarily.
- [ ] Verify the new cert covers both `tradeshow-agent.gtmtechsol.ai` and `*.tradeshow-agent.gtmtechsol.ai` (check SANs: `openssl x509 -in fullchain.pem -noout -text | grep DNS`).
- [ ] Set up cert auto-renewal (DNS plugin, e.g. `certbot-dns-godaddy`) — without it, the wildcard cert will need a manual TXT record update every ~90 days or HTTPS breaks for every tenant subdomain simultaneously.

### Step 2 — Nginx (before DNS goes live)

- [ ] Apply the `server_name` wildcard change in both server blocks (`docs/nginx-wildcard-plan.md` §1).
- [ ] Apply the regex fix to the HTTP→HTTPS redirect block (`docs/nginx-wildcard-plan.md` §2) — otherwise subdomains hitting plain HTTP will 404 instead of upgrading.
- [ ] Point `ssl_certificate`/`ssl_certificate_key` at the new wildcard cert paths.
- [ ] `sudo nginx -t` — must pass before reload.
- [ ] `sudo systemctl reload nginx` (not `restart`).
- [ ] Verify apex domain still works (`curl -I https://tradeshow-agent.gtmtechsol.ai/login` → 200) before moving to DNS — this is the rollback checkpoint: if Nginx is broken, fix it now while no subdomains are publicly resolvable yet.

### Step 3 — DNS (last, since it's what makes this publicly visible)

- [ ] Add wildcard A record (`*.tradeshow-agent` → `3.73.2.52`) in GoDaddy, TTL 600.
- [ ] Wait for propagation (a few minutes at TTL 600).
- [ ] Verify resolution: `dig +short demo.tradeshow-agent.gtmtechsol.ai` → should return `3.73.2.52`.

### Step 4 — Application verification

- [ ] Run the full checklist in `docs/testing-checklist.md`.
- [ ] Specifically re-verify the Step 0 auth fix now that a real second tenant subdomain is reachable (this is the first point it can be tested end-to-end against a live second hostname).

### Step 5 — Cleanup / hardening

- [ ] Raise DNS TTL from 600 to 3600 once stable.
- [ ] Document the new cert renewal procedure in `docs/09-deployment-guide.md`.
- [ ] Confirm monitoring/alerting (if any exists) covers the new subdomains, or note that it doesn't (per `docs/16-troubleshooting.md`, no `/health` endpoint currently exists at all — this is a pre-existing gap, not new).

## Rollback plan

| Layer | Rollback action | Time to execute |
|---|---|---|
| DNS | Delete the wildcard A record in GoDaddy | Minutes (plus TTL expiry for already-cached resolvers) |
| Nginx | `sudo nginx -t` against the previous config (keep a backup copy before editing), reload | Seconds, if a backup of the working config was saved before editing |
| SSL | No rollback needed — old single-domain cert is untouched unless `--cert-name` reuse was used to overwrite it in place (avoid this if rollback-ability matters; prefer a separate cert name so the original stays intact during testing) |
| App code (`authorize()` fix) | `docker stop/rm` the new container, restart the previous image tag — same rollback pattern documented in `docs/09-deployment-guide.md` (previous container is kept, not deleted, exactly for this) |

**General principle applied throughout:** at every step, keep the previous working artifact (Nginx config backup, previous Docker image tag, original SSL cert under its own name) until the new state is confirmed working — this mirrors the existing deploy rollback convention already in use for this project (see `docs/09-deployment-guide.md` §Rollback).

## Sign-off criteria before calling this "done"

- [ ] At least 2 real tenant subdomains (not just `demo`) verified working end-to-end per `docs/testing-checklist.md`.
- [ ] Auth fix from Step 0 confirmed actually rejecting cross-tenant login attempts (this is the test that proves the gap is closed, not just that the code compiles).
- [ ] SSL valid (no browser warning) on at least 2 subdomains plus the apex.
- [ ] Cert renewal automation confirmed working (or explicitly accepted as a manual recurring task with an owner and a calendar reminder).
