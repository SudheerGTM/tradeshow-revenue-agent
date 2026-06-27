# Production vs Main Branch — Gap Analysis

Generated 2026-06-27 by direct inspection of the running container (no assumptions — see Method).

## Summary

**Production is current with `main`.** The previously documented concern (STATUS.md, multiple prior sessions) — that production was running the `:wf` image built before the IAM reconciliation in `d0fcd51` — is **stale and no longer accurate**. A newer image, `tradeshow-agent:s3fix`, was deployed on top of that and is what's actually running. It contains the IAM overhaul and the subsequent S3/Transcribe instance-role fix. The `:wf` image is still present on the host but is not running.

| | |
|---|---|
| **Current production image** | `tradeshow-agent:s3fix` (container `tradeshow-agent`, built 2026-06-26T16:15:34Z, up 18h+ at time of check) |
| **`main` HEAD** | `cbfc28f` (2026-06-27, docs-only commit) |
| **Production code state** | At or after `06df6d8` (S3/Transcribe instance-role fix), which is one commit behind `main` HEAD — the only commit `main` has on top is a docs-only refresh |
| **Functional gap** | None found |

## Method

No source maps or `.git` metadata exist inside the container (standalone Next.js build strips both), so version could not be read directly. Instead, compiled server bundles were pulled from the running container via SSH/`docker exec` and grepped for code-level fingerprints unique to specific commits, then compared against the equivalent source in `main`:

1. `docker images` / `docker ps` on the EC2 host to identify the actual running image tag (`s3fix`, not `:wf` as previously assumed).
2. Pulled `/app/.next/server/chunks/*.js` containing the S3/Transcribe client code and grepped for the credential-resolution logic.
3. Pulled `/app/.next/server/app/api/users/[id]/route.js` and its dependency chunks, grepped for `password` field handling.
4. Listed `/app/.next/server/app/api/` to confirm the invitations/reset-password/event-access route surface exists.

## Detailed Findings

### 1. S3 / Transcribe instance-role fix (commit `06df6d8`)

Deployed bundle contains, verbatim in logic (minified):
```
credentials:process.env.AWS_ACCESS_KEY_ID?{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}:void 0
```
This is an exact match for the fix in `src/lib/aws/s3.ts` and `src/lib/aws/transcribe.ts` introduced by `06df6d8` (only pass explicit credentials when `AWS_ACCESS_KEY_ID` is set; otherwise fall back to the instance role). Confirms production includes this fix.

**Risk level: None.** Fix is present and verified live (matches the "build/lint health check" follow-up commit message on `main`).

### 2. IAM overhaul — no raw password code path (commit `d0fcd51`)

Searched the compiled `PATCH /api/users/[id]` route and its full dependency chunk set for any `password` field handling. The only matches found were:
- `URL.password` (an unrelated browser/edge-runtime URL object property)
- NextAuth's credentials-provider login form definition (`{email, password}` — the normal login form, not an admin-reset path)

No code path accepts a raw password in the user-update endpoint. This matches the safer `main` design described in `STATUS.md`'s guardrails section.

**Risk level: None.**

### 3. Invitation flow surface (commit `d0fcd51`)

Confirmed routes present in the deployed build:
- `POST /api/invitations` (create)
- `POST /api/invitations/[id]/cancel`
- `POST /api/invitations/[id]/resend`
- `POST /api/invitations/accept`

All four match the route surface described in `docs/07-authentication-security.md`. No gap.

**Risk level: None.**

### 4. Image tag confusion (process gap, not code gap)

`STATUS.md` referred to the running image as `:wf`. The actual running container uses `:s3fix`, built a day after `:wf`. `:wf` is still present on the EC2 host (`docker images` lists it, untagged-but-present, not running). This is a **documentation/process gap**: the deploy procedure does not record which tag is currently live anywhere durable (no deployed-version marker, no CI/CD log retained beyond shell history), so STATUS.md drifted out of date as soon as a follow-up hotfix shipped without a doc update.

**Risk level: Low** (no functional impact found), but **process risk: Medium** — nothing currently prevents this drift from recurring, and without inspecting the running container directly (as done here), an incorrect rollback/redeploy decision could have been made based on the stale doc.

## Recommended Action

- **No redeploy, cherry-pick, or rollback needed right now** — production and `main` are functionally aligned.
- **Process fix (recommended for Release 13.7 Priority 6/7 work):** record the deployed image tag + the `main` commit it was built from in `docs/CHANGELOG.md` or `RELEASES.md` at deploy time, so this verification doesn't require re-deriving from compiled bundles each session. See `docs/09-deployment-guide.md` — consider adding a step that tags the image with the git short-SHA instead of an ad-hoc label like `s3fix`/`wf`/`iam`, which carries no version information by itself.
- **Housekeeping:** prune unused old images (`wf`, `iam`, `qc`, `qc2`, `latest`, dangling `<none>` images) from the EC2 host — they consume disk on a small t3.small instance with already-tight memory (see `docs/16-troubleshooting.md` OOM history) and create exactly the ambiguity this report had to resolve by hand.
