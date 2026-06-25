# Developer Onboarding — Windows Setup

For a new remote developer joining `tradeshow-revenue-agent` on Windows. Read this, then `STATUS.md` and `docs/README.md` for project context.

## 1. Access you need granted (ask the project owner)

- [ ] GitHub collaborator access to `SudheerGTM/tradeshow-revenue-agent` (repo Settings → Collaborators and teams)
- [ ] `.env.local` values — sent via a secure channel (1Password share, encrypted note), never plaintext chat/email. See table in `docs/12-environment-variables.md`.
- [ ] (Only if server access is needed) Your own SSH key pair added to the EC2 instance's `authorized_keys` — do not request the existing `tradeshow-agent-key.pem`, a new key should be generated per-developer.
- [ ] AWS console access, if you'll touch infra (separate IAM user, not shared credentials)

## 2. Local prerequisites (Windows)

- **Node.js** (match the version in `package.json` engines field, or latest LTS)
- **Git for Windows** (includes Git Bash — recommended shell for running the `npm` scripts and any `sh`-style commands in docs)
- **PostgreSQL 16** — two options:
  - **Docker Desktop** (simplest on Windows): run Postgres in a container, map to port `5433` on host.
  - **Native installer** (postgresql.org) — during setup, ensure UTF-8 locale, and configure it to listen on port `5433`, not the default `5432`, to match `DATABASE_URL` conventions used by this project.
- A code editor (VS Code recommended, project has no enforced editor config beyond standard TS/ESLint)

## 3. Project setup steps

```sh
git clone https://github.com/SudheerGTM/tradeshow-revenue-agent.git
cd tradeshow-revenue-agent
npm install
```

Create `.env.local` in the project root using the values shared securely (see step 1). Full variable reference: `docs/12-environment-variables.md`. Minimum to run locally:
- `DATABASE_URL` (point at your local Postgres on port 5433)
- `AUTH_SECRET` (generate your own random dev value — do not reuse the production secret)
- `NEXTAUTH_URL=http://localhost:3000`
- `GEMINI_API_KEY`, `APOLLO_API_KEY`, `HUBSPOT_ACCESS_TOKEN`, AWS creds — only needed if testing those specific features; routes that need them will throw clearly if missing.

Start Postgres (Docker example):
```sh
docker run --name tradeshow-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16
```
Then apply the SQL migrations by hand, in order, from `drizzle/*.sql` — there is no migration runner yet (see `STATUS.md` known issues #2). Apply each file in filename order against the database referenced in `DATABASE_URL`.

Run the app:
```sh
npm run dev      # http://localhost:3000 (falls back to :3001 if taken)
npm run build    # type-check + build — use this to verify changes; no separate typecheck script
npm run lint
```

## 4. Seeded test accounts

All use password `Password123!`:
- `admin@platform.com` — platform_admin
- `admin@demo.com` — tenant_admin
- `manager@demo.com` — manager
- `booth@demo.com` — booth_user

## 5. Things that will surprise a new developer here

- **This is a customized Next.js fork** — per `AGENTS.md` at repo root, APIs/conventions may differ from standard Next.js. Check `node_modules/next/dist/docs/` before assuming familiar behavior.
- **No migration runner** — SQL files in `drizzle/` are applied manually, in order. Mismatched migration state is a common source of "feature doesn't exist" confusion — check `git log` against `main` first.
- **Tenant isolation is mandatory** on every query; `booth_user` role is further restricted to records it created itself. Don't relax this.
- **CRM sync, AI scoring, and follow-up sending all have hard guardrails** — see `STATUS.md` → "Guardrails that matter." In particular: nothing is ever auto-sent to a lead, and AI never sets a number (score/ROI/revenue are deterministic).
- **Production and `main` may be out of sync on the IAM/password-reset feature** as of this writing — see `STATUS.md` unresolved item before building on user management.

## 6. Git workflow

- Branch from `main`, open a PR for review — confirm with the project owner whether direct pushes to `main` are allowed or PRs are required.
- Don't force-push shared branches.
- Check `docs/CHANGELOG.md` and `docs/18-release-history.md` before starting work, to see what's already been built.

## 7. Where to go deeper

`docs/README.md` is the index for the full engineering documentation suite (architecture, schema, API, agents, auth, deployment, known limitations, etc.) — treat it as authoritative over chat history or this file.
