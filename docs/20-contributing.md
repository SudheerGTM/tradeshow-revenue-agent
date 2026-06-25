# 20 — Contributing Guide

## Onboarding (day one)

1. **Clone:** `git clone` the repo, check out `main`.
2. **Configure:** get `.env.local` populated — see [12-environment-variables.md](12-environment-variables.md) for every variable. There's no `.env.example`; ask whoever onboards you for a working copy of secrets, or provision your own Apollo/Gemini/HubSpot/AWS test credentials.
3. **Database:** start Postgres on port 5433 (not 5432 — see [16-troubleshooting.md](16-troubleshooting.md) if it won't start), then apply every file in `drizzle/` in numeric order:
   ```sh
   for f in drizzle/*.sql; do psql -h localhost -p 5433 -d tradeshow_agent -v ON_ERROR_STOP=1 -f "$f"; done
   ```
4. **Install + seed:** `npm install`, then `npm run db:seed` for demo tenants/users.
5. **Run:** `npm run dev`, log in with a seeded account (`admin@demo.com` / `Password123!`).
6. **Verify your setup:** `npm run build` should succeed cleanly before you change anything — if it doesn't, your environment is misconfigured, not the code.

## How to debug

- `npm run build` is the fastest way to catch type errors across the whole app — faster feedback than waiting on `npm run dev`'s incremental compiler for cross-file issues.
- Read the actual SQL: `psql` directly against the local database is more trustworthy than reading the UI when verifying a mutation worked correctly (see [15-testing-guide.md](15-testing-guide.md)).
- For anything touching auth/sessions, check `fetch('/api/auth/session')` directly in the browser console — don't assume the UI reflects the real session state.
- See [16-troubleshooting.md](16-troubleshooting.md) before assuming you've found a new bug — several recurring issues are already documented there.

## How to deploy

See [09-deployment-guide.md](09-deployment-guide.md) in full — there is no one-command deploy; it's a manual SSH/Docker sequence. **Do not attempt to deploy to production without understanding the OOM/swap issue described there first.**

## Coding standards

See [14-coding-standards.md](14-coding-standards.md). The short version: match the existing pattern in the nearest sibling file before inventing a new one, keep tenant-scoping on every query, never reintroduce a raw-password code path, and default to no comments unless explaining a genuine non-obvious *why*.

## Branch strategy

There is no formally documented branching model. In practice: feature work happens on a branch, merged (or cherry-picked) into `main`. **Important:** branches have drifted from `main` before (see [16-troubleshooting.md](16-troubleshooting.md), "Migration drift between git branches/worktrees") — before doing substantial work on a long-lived branch, `git log --oneline main` and diff against your branch to confirm you're not missing a merged release.

## Pull request process

No formal PR template or required-reviewer process is enforced in this repo currently. At minimum, before opening a PR:
1. `npm run build` passes.
2. `npm run lint` passes.
3. If you touched the schema, a new numbered `drizzle/00XX_*.sql` file exists and was tested locally.
4. If you touched auth/session/tenant-scoping, re-read [07-authentication-security.md](07-authentication-security.md) and [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md) and confirm you haven't regressed either guarantee.
5. Update the relevant `/docs` file in the same PR if your change affects documented behavior — this folder is meant to stay in sync with the code, not drift like `STATUS.md` did.

## Release checklist

1. Apply any new migration to **every** environment in order — local, then production RDS (never skip an environment or apply out of order).
2. `npm run build` clean.
3. Manual smoke test of the changed feature area per [15-testing-guide.md](15-testing-guide.md).
4. Deploy per [09-deployment-guide.md](09-deployment-guide.md), watching for the OOM risk on the build step.
5. Post-deploy: `curl` the live login page, log in as a real account, click through the changed feature on the actual production domain (not just the EC2 instance's local port).
6. Update [18-release-history.md](18-release-history.md) and [CHANGELOG.md](CHANGELOG.md) with what shipped.

## CHANGELOG

Every release gets an entry in [CHANGELOG.md](CHANGELOG.md) — release number, date, major features, database changes, breaking changes, bug fixes, known issues at time of release. Keep it accurate to what actually shipped, not what was originally scoped.
