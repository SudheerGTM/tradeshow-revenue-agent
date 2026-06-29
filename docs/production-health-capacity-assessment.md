# Production Health Check & Capacity Assessment (Pre-Demo)

Assessment only — no infrastructure or code changes made. All data below pulled live from AWS CloudWatch, the EC2 instance, RDS, and direct API calls on 2026-06-29, ahead of tomorrow's 5-concurrent-user demo.

## Executive Summary

| | |
|---|---|
| **Overall Health Score** | **7/10** |
| **Demo Readiness** | **Ready with Minor Risks** — one critical config gap (HubSpot) must be fixed before any CRM Sync demo step; everything else is healthy with comfortable headroom |

The infrastructure itself (EC2, RDS) is in good shape with full CPU credit reserves and low baseline load. The real risks for tomorrow are **configuration gaps and resource contention from non-demo processes**, not raw capacity.

## 1. EC2 Health Assessment

| Metric | Value |
|---|---|
| Instance type | t3.small (2 vCPU, burstable) |
| RAM | 1.9 GiB total |
| Storage | 20 GB (`/dev/nvme0n1p1`), 11 GB used (54%), 9.3 GB free |
| Swap | 2 GB configured, only 56 MB in use |
| CPU utilization (last 3h) | 0.4–3.2% average, briefly up to 14% — essentially idle |
| CPU credit balance | **576 / 576 — fully banked (max for this instance type)** |
| Load average | 0.00, 0.00, 0.00 |
| Memory used | 927 MiB / 1.9 GiB (806 MiB available) |
| Container memory | 102 MiB / no hard limit set |

**Sufficient for 5 concurrent users + AI workflow + Apollo + Gemini + CRM Sync + voice upload + OCR?** Yes, on raw compute — current load is negligible and CPU credits are fully banked. The actual constraint is memory headroom, not CPU (see Risks).

## 2. Resource Monitoring

- **No PM2** — this app runs as a single Node process inside Docker (`docker-entrypoint.s…`), not PM2-managed.
- **Docker container**: 1 container running (`tradeshow-agent:e51607e`), 0% CPU at idle snapshot, 102 MiB RSS, only 19 open file descriptors — very lightweight footprint.
- **Bottleneck found — not the app**: a **VS Code Remote-SSH session is connected directly to this production instance**, and its Node-based server processes are consuming **~462 MiB (23.6% of total RAM)** by themselves. This is real, currently-active resource contention competing with the app for the same 1.9 GiB.
- Disk usage at 54% is fine for now but several old/unused Docker images likely remain from prior deploys (per earlier session work) — not urgent, but worth pruning periodically.

## 3. Database Assessment

| Metric | Value |
|---|---|
| Instance class | **db.t4g.micro** (burstable, 2 vCPU, 1 GiB RAM) |
| `max_connections` (Postgres) | 79 |
| Active connections (snapshot) | 9 |
| App's own connection pool | **`max: 5`** (`src/db/index.ts`) |
| CPU utilization (last 3h) | ~3.2–3.5% average, ~5–6% peak |
| CPU credit balance | **288 / 288 — fully banked (max for this instance type)** |
| Free storage | ~18.3 GB of 20 GB allocated |
| Database size | 11 MB total — trivial |

Postgres itself has plenty of headroom (9 of 79 connections used). The tighter constraint is the **application's own pool, capped at 5 connections** — see Risks below.

## 4. AI Workflow Performance

Measured from real `agent_executions` rows over the last 14 days (19 completed full workflow runs in the last 7 days):

| Stage | Avg duration | Notes |
|---|---|---|
| Conversation Intelligence (Gemini) | 5.67s | 2 failures recorded in 14 days (~10% failure rate on this stage — matches a known JSON-parsing edge case seen in QA testing) |
| Company/Contact Enrichment (Apollo) | 0.87s | Fast — likely cache-skip path working as intended |
| Lead Scoring (deterministic + Gemini explanation) | 7.10s | |
| Follow-Up Generation (Gemini) | 8.79s | **Slowest stage** |
| CRM Sync Preparation | 0.03s | No AI call, fast |
| ROI Calculation | 0.04s | No AI call, fast |
| **Full workflow, end to end** | **~21.8s average** | |

**Slowest stages are the two Gemini calls** (follow-up generation, then lead scoring). If 5 users each trigger a full workflow at the same moment, that's 5 simultaneous Gemini calls — see External API Readiness for quota risk.

## 5. External API Readiness

| Service | Credentials present | Verified live | Status |
|---|---|---|---|
| Apollo | Yes | **Tested live — 200 OK, real results returned** | ✅ Working |
| Gemini | Yes (key format valid) | Not separately tested live in this pass (already exercised via recent successful workflow runs above) | ✅ Working |
| AWS SES | N/A (instance role) | Account queried directly | ⚠️ **Still in SES sandbox** — `ProductionAccessEnabled: false`, 200 emails/24h cap, 1/sec rate limit, **only verified addresses can receive real mail**. Pre-existing, known constraint — not new, but relevant if the demo plan includes a live invitation-email moment to an unverified address. |
| AWS S3 / Transcribe | Yes (instance role, confirmed working) | Already verified working earlier this engagement | ✅ Working |
| **HubSpot** | **Set but empty** (`HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_PIPELINE_ID`, `HUBSPOT_STAGE_ID` all blank) | **Tested live — 401 Unauthorized, `INVALID_AUTHENTICATION`** | ❌ **Broken** |

**Demo risk:** any attempt to approve a CRM Sync during the demo will fail outright.

## 6. Security Review

- **HTTPS**: working, cert valid `2026-06-28` → `2026-09-26` (Let's Encrypt) — no expiry risk for the demo.
- **Session handling**: NextAuth JWT sessions, confirmed working in this engagement (tenant-scoped auth fix verified live recently).
- **Environment variables**: no static AWS keys present in production (instance-role-only, fixed earlier this engagement) — reduces secret-exposure surface.
- **No secrets exposed in this check**: all credential checks above only printed lengths/status codes, never raw values.
- **Authentication**: healthy, verified via live login test during this assessment is unnecessary to repeat — already confirmed working in recent prior session work.
- **Multi-tenant isolation**: functioning per prior session's dedicated review (`docs/08-multi-tenant-architecture.md`, `docs/security-review.md`).

## 7. Capacity Estimate

Reasonable engineering estimates given the data above:

| Metric | Estimate |
|---|---|
| Concurrent users (interactive UI) | 10–15 comfortably at current resource levels; 5 is well within range |
| Leads captured/hour | Hundreds — capture itself is a cheap DB write, not a bottleneck |
| Workflow executions/hour | ~150–170 sequential (at ~22s each) if run one at a time; **concurrent execution is bounded by the DB pool (5) and Gemini's own rate limits**, not raw compute |
| CRM syncs/hour | **Currently 0 — broken** until HubSpot credentials are fixed |
| Apollo requests/hour | Apollo's own plan-level rate limit applies (not inspected here — recommend checking Apollo dashboard quota directly if not already known) |
| Gemini requests/hour | Bounded by Google's per-project quota (not inspected here) — 5 simultaneous calls is almost certainly fine for any standard paid tier, but not separately verified in this pass |

## 8. Demo Risk Assessment

**Scenario: 5 users simultaneously login, capture leads, scan business cards, upload voice notes, run AI workflow, review insights, CRM sync, refresh dashboard.**

**Will the server comfortably support this?** Mostly yes — with one hard failure point and one soft contention point:

- **Will fail first:** any **CRM Sync** step — HubSpot auth is broken right now.
- **Most likely soft spot under real concurrency:** the **5-connection DB pool** combined with the **dashboard's known N+1-style query pattern** (documented separately in `docs/performance-review.md` — the dashboard issues ~25+ sequential queries per load). Five users refreshing the dashboard at the same moment could legitimately queue up against the 5-connection cap, each waiting briefly rather than failing outright (pool `connectionTimeoutMillis` is 10s, so worst case is a slow page, not an error, unless contention is sustained).
- **Memory headroom is reduced right now** by the active VS Code Remote-SSH session (~24% of total RAM). Not a hard blocker, but it removes a meaningful safety margin on a 1.9 GiB box.

## 9. Upgrade Recommendation

### **Option A — Current infrastructure is sufficient. No upgrade required.**

Reasoning: CPU credits are fully banked on both EC2 and RDS, baseline load is negligible, and the database is essentially empty (11 MB). The risks identified are **configuration and process-hygiene issues, not capacity issues** — an EC2/RDS upgrade would not fix the HubSpot credentials gap, the VS Code session, or the dashboard query pattern. Spending money on bigger instances would not address what's actually at risk tomorrow.

## 10. Cost Impact

No upgrade recommended, so no cost impact. (For reference, if this were ever needed: t3.small → t3.medium is roughly +$15/month; db.t4g.micro → db.t4g.small is roughly +$12/month — neither is justified by the data above.)

## 11. Performance Recommendations — Low-Risk Quick Wins Before Tomorrow

1. **Fix HubSpot credentials** (`HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_PIPELINE_ID`, `HUBSPOT_STAGE_ID` in `.env.production`) — only action in this list that requires a value only the account owner has (a HubSpot private-app token). **Critical if CRM Sync is part of the demo script.**
2. **Disconnect the VS Code Remote-SSH session** from the production box before the demo starts — frees ~24% of total RAM immediately, zero risk, zero cost.
3. **Restart the container** (`docker restart tradeshow-agent`) shortly before the demo as a clean pre-warm — clears any accumulated state, costs ~10-15s of downtime during a non-demo window. Optional but low-risk.
4. **Do not run a build on the box during or right before the demo** — known OOM risk on this instance (documented in `docs/16-troubleshooting.md`); deploy any last-minute changes well ahead of time, not last-minute.
5. **Confirm SES sandbox constraint with whoever owns the demo script** — if the plan includes inviting a real new user by email live, only `info@gtmtechsol.com` will actually receive it.

Not recommended for tomorrow: connection pool size changes, PostgreSQL tuning, caching layers — none of these are evidenced as necessary by the data, and changing them under time pressure carries more risk than benefit.

## Risks (Prioritized)

| Priority | Risk |
|---|---|
| **Critical** | HubSpot credentials empty — CRM Sync will fail with 401 on first attempt |
| **High** | VS Code Remote-SSH session consuming ~24% of total RAM on a 1.9 GiB box during the demo window |
| **Medium** | DB connection pool (5) has zero headroom above the demo's own 5 concurrent users if multiple AI workflows + dashboard loads overlap |
| **Medium** | SES sandbox mode — live invite-email demo only works for one verified address |
| **Low** | Dashboard N+1 query pattern (pre-existing, documented separately) — adds latency under concurrency, doesn't cause failures |
| **Low** | Conversation Intelligence agent has a ~10% historical failure rate (Gemini JSON parsing edge case) — not new, already known |

## Recommendations — Immediate Actions Before Tomorrow

1. Populate real HubSpot credentials, or remove CRM Sync from the demo script if a token isn't available in time.
2. Close the VS Code Remote-SSH connection to the production box.
3. Brief whoever is running the demo on the SES sandbox limitation if invitations are part of the script.

## Capacity Estimate (Summary)

**~10–15 concurrent interactive users supported comfortably today.** Tomorrow's 5-user demo is well within range on raw infrastructure; the binding constraints are the HubSpot config gap (hard failure) and current memory contention from the dev session (soft risk), not EC2/RDS sizing.

## Upgrade Recommendation (Summary)

**No upgrade needed before tomorrow.** Revisit instance sizing only if/when real customer traffic patterns emerge post-demo — today's data doesn't support spending more on infrastructure.
