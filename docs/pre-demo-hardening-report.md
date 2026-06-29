# Pre-Demo Hardening — Final Report

Actions taken ahead of tomorrow's 5-user demo. No EC2/RDS infrastructure sizing changed, per instruction. One small, low-risk application fix shipped (HubSpot graceful failure) since it was explicitly called out as safe to do.

## 1. VS Code Remote-SSH — disconnected

A developer's VS Code Remote-SSH session was connected directly to the production EC2 instance, consuming ~462 MiB (24% of total RAM) for IDE tooling alone. Terminated cleanly (`kill` on the session's process group — no app/container processes touched).

## 2. Health verification after cleanup

| Check | Before | After |
|---|---|---|
| Memory available | 806 MiB | **1.3–1.4 GiB** |
| Memory used | 927 MiB | 344–411 MiB |
| Load average | 0.00 | 0.25 (brief, from the deploy below — back to near-zero at rest) |
| Disk | 54% used, 9.3 GB free | unchanged |
| App container | Up, healthy | Up, healthy |
| Nginx | active | active |
| Database connectivity | — | confirmed live (`select 1` round-trip succeeded) |
| App logs | — | no errors in the last 10 min at check time |
| Local + public health check | 200 / 200 | 200 / 200 |

Freed roughly **600 MB of headroom** on a 1.9 GB box — meaningful margin restored ahead of tomorrow.

## 3. HubSpot

- **Confirmed**: `HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_PIPELINE_ID`, and `HUBSPOT_STAGE_ID` are all blank in production right now.
- **Do not attempt CRM Sync in the demo** unless valid credentials are supplied before tomorrow.
- **Shipped a small, low-risk fix** (`fix: CRM Sync fails gracefully when HubSpot isn't connected`, commit `7e2376c`, now live in production):
  - A new `GET /api/crm-sync/status` endpoint reports whether HubSpot is connected.
  - The CRM Sync panel now shows a clear banner *before* anyone clicks Approve: **"CRM Sync is configured but HubSpot credentials are not connected in this tenant. Contact your administrator to connect HubSpot."**
  - If Approve is clicked anyway, the same message now returns instead of the previous raw `HUBSPOT_ACCESS_TOKEN is not set` error — verified live against a real pending sync job in production; the job correctly stays in `approved` status (not stuck `processing`), so it can be retried the moment real credentials are added.

## 4. SES

- **Confirmed**: SES is still in sandbox mode (`ProductionAccessEnabled: false`), 200 emails/24h cap, 1/sec rate limit.
- **Do not demo live email delivery** to any address except the one verified recipient (`info@gtmtechsol.com`) unless production access is approved before tomorrow.

## 5. Demo Readiness Checklist

| Step | Status | Notes |
|---|---|---|
| Login | ✅ Ready | |
| Capture lead | ✅ Ready | |
| OCR / business card scan | ✅ Ready | |
| Apollo enrichment | ✅ Ready | Live-tested during assessment, 200 OK |
| Gemini workflow | ✅ Ready | 19 successful runs in last 7 days, ~22s avg end-to-end |
| Lead score | ✅ Ready | |
| Follow-up draft | ✅ Ready | |
| Opportunity | ✅ Ready | |
| ROI dashboard | ✅ Ready | |
| **CRM Sync** | ⛔ **Skip unless HubSpot credentials are added before tomorrow** | Now fails with a clear message instead of a raw error if attempted anyway — won't look broken, but won't actually sync |
| Email/invitation delivery | ⚠️ Only to `info@gtmtechsol.com` | SES sandbox |

## 6. Known Limitations (carried into the demo)

- CRM Sync is non-functional until real HubSpot credentials are supplied.
- Live email delivery only reaches one verified address.
- The app's DB connection pool is capped at 5 — matches the demo's 5 users exactly, with no spare capacity if a workflow run and a dashboard refresh happen to overlap. Not expected to cause errors (10s timeout before any failure), just possible momentary slowness under worst-case overlap.
- Dashboard issues a large number of sequential queries per load (pre-existing, documented separately in `docs/performance-review.md`) — adds latency under concurrency, not a failure risk.

## 7. What Not to Demo

- **Do not click Approve on a CRM Sync** unless HubSpot credentials have been added — it will now fail with a clear message rather than an error page, but it still won't actually create anything in HubSpot.
- **Do not send a live invitation/reset email to a real attendee's address** expecting them to receive it — only `info@gtmtechsol.com` will actually get mail.

## Rollback / Restart Commands

If the app becomes sluggish or unresponsive during the demo:

```sh
# Restart the app container (fastest recovery, ~10-15s downtime)
ssh -i ~/.ssh/tradeshow-agent-key.pem ec2-user@3.73.2.52 "sudo docker restart tradeshow-agent"

# If that doesn't help, roll back to the previous known-good image:
ssh -i ~/.ssh/tradeshow-agent-key.pem ec2-user@3.73.2.52 "
  sudo docker stop tradeshow-agent && sudo docker rm tradeshow-agent
  sudo docker rename tradeshow-agent-prev-e51607e tradeshow-agent
  sudo docker start tradeshow-agent
"

# Verify recovery either way:
curl -s -o /dev/null -w '%{http_code}\n' https://tradeshow-agent.gtmtechsol.ai/login   # expect 200
```

**Do not** run a fresh `docker build` on the instance during or immediately before the demo — known OOM risk on this 2GB box (documented in `docs/16-troubleshooting.md`); any further deploys should happen well ahead of the demo window, not last-minute.

## Final Status

**Demo-ready, with CRM Sync excluded from the script unless HubSpot credentials arrive beforehand.** Infrastructure sizing was not changed — none of the issues found were capacity problems, and the data doesn't support spending on an upgrade before tomorrow.
