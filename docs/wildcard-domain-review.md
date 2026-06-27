# Wildcard Domain Review — DNS & SSL

Inspection only. No DNS, SSL, or Nginx changes have been made. Findings below are from direct inspection of the live infrastructure on 2026-06-27.

## Current state (verified)

| Item | Finding |
|---|---|
| DNS provider | GoDaddy — confirmed via `dig NS gtmtechsol.ai` → `ns01.domaincontrol.com` / `ns02.domaincontrol.com` |
| Current record | `tradeshow-agent.gtmtechsol.ai` is an **A record** → `3.73.2.52` (verified via `dig +short`) |
| IP type | `3.73.2.52` is an **Elastic IP** allocated to `i-0ddfdeaef544e8bdd` (`eipalloc-0d27954d96dab6626`, confirmed via `aws ec2 describe-addresses`) — static, will not change on instance stop/start/reboot |
| Existing subdomains | None — `dig +short demo.tradeshow-agent.gtmtechsol.ai` returns empty today |
| SSL certificate | Let's Encrypt via Certbot, **single-domain only**, covering exactly `tradeshow-agent.gtmtechsol.ai`. No wildcard cert exists. |

## DNS recommendation: Wildcard A record (not CNAME)

**Recommended:** add `*.tradeshow-agent` as a wildcard **A record** pointing directly at the Elastic IP `3.73.2.52`.

### Why A record over CNAME here

| | Wildcard A record | Wildcard CNAME |
|---|---|---|
| Target | Elastic IP directly | `tradeshow-agent.gtmtechsol.ai` (the apex-style A record) |
| Extra DNS lookup per request | No — resolves directly | Yes — client must resolve the CNAME target, then that target's A record (one extra round trip, typically tens of ms) |
| Breaks if EIP changes | Yes, but the IP is an Elastic IP specifically chosen to be stable — this is a non-issue in practice | No — CNAME insulates from IP changes |
| GoDaddy wildcard support | Standard, no caveats | GoDaddy wildcard CNAMEs work but some registrars historically have quirks with CNAME at non-apex wildcard hosts; GoDaddy's are fine, but it's one more layer to misconfigure |
| Failure mode if `tradeshow-agent.gtmtechsol.ai`'s own A record is ever changed independently | Wildcard subdomains unaffected (they point straight at the IP) | Wildcard subdomains would silently follow whatever the apex record changes to — could be surprising if the apex is ever repointed for an unrelated reason (e.g. a CDN in front of just the main domain) |

**Conclusion:** since the IP is already an Elastic IP (the reason CNAME indirection is normally preferred — to avoid hardcoding a volatile IP — doesn't apply here), a direct wildcard A record is simpler, has one less DNS hop, and has no real downside in this specific setup. If the EIP is ever released/reassigned in the future, both the apex and wildcard records would need updating either way.

**If circumstances change** (e.g. a CDN/load balancer is introduced in front of the EC2 instance later), switch to CNAME at that point — that's exactly the scenario CNAME indirection is for.

### Exact record to add

```
Type:      A
Host:      *.tradeshow-agent
Points to: 3.73.2.52
TTL:       600 (10 min) while testing — raise to 3600 (1 hr) once confirmed stable
```

Do not remove or modify the existing `tradeshow-agent.gtmtechsol.ai` A record — the wildcard is additive.

## SSL recommendation: wildcard cert required, via DNS-01

**Current cert does not cover subdomains** — confirmed by inspecting `/etc/nginx/conf.d/*.conf`, which references `ssl_certificate /etc/letsencrypt/live/tradeshow-agent.gtmtechsol.ai/fullchain.pem` (Certbot-managed, single-domain).

**Required:** a wildcard certificate covering `*.tradeshow-agent.gtmtechsol.ai` (and ideally still `tradeshow-agent.gtmtechsol.ai` itself in the same cert, via SAN).

### Why DNS-01, not HTTP-01

Let's Encrypt cannot issue wildcard certs via the standard HTTP-01 challenge (which proves control of a single hostname by serving a file at a well-known path) — wildcards **require DNS-01**, which proves control of the domain by creating a TXT record. This means the standard `certbot --nginx -d ...` flow used for the original cert won't work unmodified for a wildcard; it needs either:
- `certbot certonly --manual --preferred-challenges dns -d tradeshow-agent.gtmtechsol.ai -d "*.tradeshow-agent.gtmtechsol.ai"` (manual — you create the TXT record yourself in GoDaddy each renewal, every ~90 days), or
- A Certbot DNS plugin for GoDaddy (`certbot-dns-godaddy` or similar) to automate the TXT record creation/renewal — recommended if this is going to be a recurring renewal, given Certbot certs expire every 90 days and Let's Encrypt does not support indefinite wildcard certs without DNS-01 automation.

**Not recommended for this setup:** AWS ACM. ACM certs are free and support wildcards via DNS validation, but they only attach to AWS-managed load balancers (ALB/CloudFront/API Gateway) — they **cannot** be installed directly into Nginx running on a plain EC2 instance. Since this deployment has no load balancer in front of it (Nginx runs directly on the EC2 box per `docs/10-aws-infrastructure.md`), ACM is not usable here without first introducing an ALB — a much larger infrastructure change than this task calls for. Certbot/Let's Encrypt remains the right tool.

### Certbot command (when ready to execute — not run yet)

```sh
sudo certbot certonly --manual --preferred-challenges dns \
  -d tradeshow-agent.gtmtechsol.ai \
  -d "*.tradeshow-agent.gtmtechsol.ai"
```

This will prompt for a TXT record (`_acme-challenge.tradeshow-agent.gtmtechsol.ai`) to be added in GoDaddy DNS before it can issue the cert. Plan for a DNS propagation wait (a few minutes with TTL 300, GoDaddy is usually fast) before confirming the challenge.

### Nginx changes needed after the new cert is issued

The `ssl_certificate`/`ssl_certificate_key` paths in the existing Certbot-managed server block will need to point at the new wildcard cert's path (Certbot typically creates a new `live/` directory, e.g. `live/tradeshow-agent.gtmtechsol.ai-0001/`, unless `--cert-name` is specified to reuse the original). See `docs/nginx-wildcard-plan.md` for the exact server block changes.

## Risks / blockers identified

1. **90-day renewal burden** — without a DNS API plugin, the wildcard cert requires manual DNS-01 TXT record updates every renewal. Recommend setting up `certbot-dns-godaddy` (or equivalent) before relying on this in production long-term, otherwise the cert will silently expire and break HTTPS for all tenant subdomains simultaneously.
2. **No blocker found on the DNS/IP side** — the Elastic IP is stable, GoDaddy supports wildcard A records natively, no migration needed there.
3. **Sequencing matters**: SSL cert must be issued and Nginx updated *before* DNS goes live publicly, or visitors to a new subdomain will hit a certificate mismatch error during the gap. See `docs/deployment-checklist.md` for the recommended order.
