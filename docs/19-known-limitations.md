# 19 — Known Limitations

Written deliberately without spin. If something here is uncomfortable to read, that's the point — hiding it would just mean the next developer rediscovers it the hard way.

## Infrastructure / Operations

- **No migration runner.** Migrations are hand-written `.sql` files applied via `psql`, in numbered order, by a human, to every environment separately. There is real risk of environment drift (this already happened once this session — a git branch was missing an entire release's migration relative to `main`). **Fix priority: high.**
- **No CI/CD pipeline.** Every deploy is a manual SSH/SCP/Docker sequence run from a developer's laptop. No automated build-on-push, no automated rollback.
- **Single EC2 instance, no redundancy.** If the t3.small instance goes down, the app is down. No load balancer, no auto-scaling, no multi-AZ RDS.
- **RDS backup retention capped at 1 day** — the AWS account is on the Free Tier, which restricts backup retention; a real incident could lose up to a day of data.
- **AWS Transcribe is non-functional** — the AWS account isn't subscribed to the service. This has been true since the feature was built; it's surfaced honestly in the UI but never actually fixed.
- **AWS SES is in sandbox mode** — only one verified address can receive real emails in production right now. Production access was requested but approval timing is outside this project's control.
- **No automated test suite** — zero unit, integration, or end-to-end tests exist. All verification is manual and browser-driven (see [15-testing-guide.md](15-testing-guide.md)).
- **No CI lint/typecheck gate** — `npm run build` and `npm run lint` exist as scripts but nothing enforces running them before merge.
- **No `.env.example`** — onboarding a new developer to local dev requires someone handing them a populated `.env.local` or reconstructing it from [12-environment-variables.md](12-environment-variables.md).

## Performance

- **Dashboard N+1 query pattern** — `recalculateAndStoreROI()` is called inside a sequential loop over every tenant event on each dashboard load, each call itself issuing 8+ queries. For a tenant with 10+ events this could mean 80+ sequential DB round-trips on a single page load. **High severity, not yet fixed.**
- **Dashboard issues 15+ sequential (non-batched) queries** even outside the ROI loop — none of it uses `Promise.all()`. Medium-to-high severity depending on data volume.
- **Lead-detail tabs may double-fetch data** the parent component already fetched, since several tabs independently call their own `/api/` endpoints on mount rather than receiving data as props.

## Data model

- **No soft-delete/retention on most tables** — only `voice_notes` and `business_card_images` implement `deletedAt`/`retentionDeleteAt`, and even then, **no scheduled job actually purges expired rows** — the retention timestamp is set but nothing acts on it yet.
- **File sizes stored as `text`, not a numeric type** — `voiceNotes.fileSizeBytes`/`businessCardImages.fileSizeBytes` are `text` columns "to avoid bigint friction" per the schema comment, parsed back to numbers in application code on every read. Works, but it's a workaround, not a clean design.
- **`agent_policies.agentName` is a plain string, not a foreign key** to `agent_registry.agentName` — nothing in the database prevents a policy referencing a nonexistent agent.
- **Subdomain-based tenant routing is unused** — `tenants.subdomain` exists in the schema but production resolves tenancy by other means; the column is forward-looking infrastructure, not active.

## Security

- **No rate limiting** on any route beyond the 5-attempt login lockout — other endpoints (password reset request, invitation creation) have no throttling.
- **`HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` were found empty** in `.env.local` during a recent session despite documentation claiming otherwise — verify before assuming CRM sync is fully wired end-to-end in any given environment.
- **`session.user.id` was silently null for an unknown period** before being caught and fixed (see [16-troubleshooting.md](16-troubleshooting.md)) — any audit log rows or `created_by_user_id` values from before the fix may be unreliable for attribution.
- **An unexplained password drift occurred on `admin@demo.com` in production** during this project's session work — the stored hash stopped matching the documented demo password between two deploys, and the root cause was never identified (just worked around by resetting it directly). If this recurs, it's worth properly investigating rather than reset-and-move-on again.

## Code quality (see `code-inspection-report.md` for full detail)

- `src/db/schema.ts` is a single 997-line file covering every table — a refactor into per-domain files would help navigability.
- `src/app/(app)/dashboard/page.tsx` is 800+ lines and growing with every release that adds a KPI section.
- Duplicate logic between `voice-notes/initiate-upload` and `business-cards/initiate-upload` (~70% overlap) was never extracted into a shared helper.
- `deleteAudioFile()`/`getAudioMetadata()` in `src/lib/aws/s3.ts` are misleadingly named — both are used generically for non-audio files (business cards) today.

## Product scope (explicitly out, not forgotten)

- No email-sending capability for leads anywhere (follow-up drafts are never sent) — this is a deliberate guardrail, not a gap, but worth stating plainly so nobody "fixes" it without a product decision.
- No SSO/MFA/SCIM (see [07-authentication-security.md](07-authentication-security.md)) — explicitly deferred per the Release 13.6 spec.
- No billing/subscription backend — the Settings page has a labeled placeholder only.
- No policy management UI — `agent_policies` rows are seeded directly in the database; there's a read-only API but no edit interface.
