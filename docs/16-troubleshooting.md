# 16 — Troubleshooting Guide

Real problems hit during this project's development and deployment, with the actual fix.

## Login fails with `UntrustedHost`

**Symptom:** every auth request fails on the production domain with `[auth][error] UntrustedHost`.
**Cause:** Auth.js v5 requires explicit host trust when running behind a reverse proxy (Nginx) on a custom domain.
**Fix:** `trustHost: true` in the NextAuth config (`src/lib/auth.ts`). Already applied — if this regresses, check that this line wasn't accidentally removed.

## `session.user.id` is `null`/`undefined`, `createdByUserId` writes NULL

**Symptom:** Leads/audit logs show `created_by_user_id`/`user_id` as `NULL` even when created by a logged-in user.
**Cause:** The NextAuth `jwt`/`session` callbacks only copied `role`/`tenantId` from the user object, never `id`.
**Fix:** Confirm `src/lib/auth.ts`'s `jwt` callback sets `token.id = user.id` and the `session` callback sets `session.user.id = token.id`, and `src/types/next-auth.d.ts` declares `id: string` on `Session.user`. If you see this bug again after a refactor, check these three spots first.

## Business card camera shows solid black instead of live video (iOS Safari)

**Symptom:** Camera permission is granted, "Capture Photo" button is enabled, but the preview is a black box — only reproduces on real iPhones, not desktop/headless preview.
**Cause:** The `<video>` element was conditionally mounted (inside `{state === "camera" && ...}`), and the code attached `srcObject`/called `.play()` via `setTimeout` immediately after `getUserMedia`, before React had actually committed the element — a classic iOS Safari `getUserMedia` race.
**Fix:** Attach the stream in a `useEffect` keyed on the state value, so it only runs after the `<video>` element is actually in the DOM; add explicit `autoPlay` attribute and `.play().catch()` error handling. See `src/components/BusinessCardScanner.tsx`.

## AWS Transcribe fails with `SubscriptionRequiredException`

**Symptom:** Starting a transcription job always fails.
**Cause:** The AWS account isn't subscribed to the Transcribe service — this is an account-level issue, not a code/config bug. IAM permissions and env vars are correctly set.
**Fix:** Needs an AWS account action outside the app. Surfaced honestly in the Integrations card as "Needs Attention" — don't try to "fix" this with code changes.

## Apollo contact enrichment silently fails / returns nothing

**Symptom:** Company enrichment works but contact enrichment never finds anyone.
**Cause:** Apollo's `/people/search` endpoint is deprecated and returns 422 for every call.
**Fix:** `src/lib/enrichment/apollo.ts` uses the two-step `/mixed_people/api_search` + `/people/match` flow instead. If this regresses (someone reverts to the old endpoint), re-apply the two-step pattern.

## Gemini calls fail with a 404-ish "model not found" error

**Symptom:** Any AI feature (conversation analysis, OCR, scoring explanation) fails outright.
**Cause:** `GEMINI_MODEL` is set to an old/retired model name (e.g. `gemini-2.0-flash`, `gemini-1.5-*`).
**Fix:** Set `GEMINI_MODEL=gemini-2.5-flash` (the current default). Check this env var first whenever Gemini calls start failing en masse.

## SES emails aren't arriving for real users

**Symptom:** Invitation/reset emails never reach the intended recipient.
**Cause:** SES is in **sandbox mode** on this AWS account — it can only send to a verified address (`info@gtmtechsol.com`), regardless of who the app thinks it's emailing.
**Fix:** Either test using `info@gtmtechsol.com` as the recipient, or wait for/escalate the AWS production-access request (`aws sesv2 put-account-details --production-access-enabled`, already submitted once). Not fixable from the application side.

## S3 upload fails with a 403 on the PUT

**Symptom:** Presigned upload URL returns 403 when the client PUTs the file.
**Likely causes:** Content-Type header on the PUT doesn't exactly match what was signed; the presigned URL expired (10-minute window for uploads); the IAM role/key lacks `s3:PutObject` on that bucket/prefix.
**Check:** `src/lib/aws/s3.ts`'s `generatePresignedUploadUrl` — confirm the `ContentType` passed to the signer matches the client's actual upload `Content-Type` header exactly.

## Docker build hangs / EC2 stops responding to SSH mid-deploy

**Symptom:** `docker build` on the EC2 instance never finishes, and shortly after, SSH connections start timing out at the banner-exchange stage — while `aws ec2 describe-instance-status` still reports the instance as healthy.
**Cause:** The t3.small instance (2GB RAM) runs out of memory during the Next.js build and thrashes, starving `sshd` of CPU to even respond to new connections.
**Fix:** A 2GB swapfile was added (`/swapfile`, persisted in `/etc/fstab`) specifically to prevent this. If it happens again despite the swap, `aws ec2 reboot-instances` recovers the box in under a minute — the container auto-restarts via `--restart unless-stopped` with minimal downtime. Always run builds detached (`nohup ... &`, logged to a file) so a dropped SSH session doesn't kill an in-progress build.

## Local Postgres won't start on port 5433 — "lock file already exists"

**Symptom:** `pg_ctl start -o "-p 5433"` fails with `lock file "postmaster.pid" already exists`.
**Cause:** A `brew services`-managed Postgres instance auto-started on the default port 5432 using the *same data directory*, holding the lock.
**Fix:** `brew services stop postgresql@16` first, then start manually with `-o "-p 5433"`. Confirmed safe — it's the same data directory, just a port mismatch, not data loss risk.

## Migration drift between git branches/worktrees

**Symptom:** A feature (e.g. the Workflow tab) is missing in the UI despite the migration/table existing in the database.
**Cause:** A working branch was created before a prior release's commit landed on `main`, and was never rebased — so the branch is missing entire features that exist on `main`.
**Fix:** `git log --oneline` and compare against `main` before assuming a feature was never built — it may just be missing from your current branch. `git cherry-pick` the missing commit(s) rather than rebuilding from scratch.

## Database connectivity — wrong port assumed

**Symptom:** App can't connect to Postgres locally even though "Postgres is running."
**Check first:** `lsof -i :5433` and `pg_isready -h localhost -p 5433` — this project's convention is port 5433, not the Postgres default 5432, specifically because something else on development machines has historically already owned 5432.
