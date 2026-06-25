# 12 — Environment Variables

All variables live in `.env.local` for local dev (gitignored) and in `.env.production` on the EC2 instance (pulled from AWS Secrets Manager at deploy time, also not committed). None of these have a `NEXT_PUBLIC_` prefix — nothing here is intentionally exposed to the browser.

| Variable | Purpose | Required | Example | Default if unset | Sensitive |
|---|---|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | Yes | `postgresql://user@localhost:5433/tradeshow_agent` | — (throws on connect) | Yes |
| `DATABASE_SSL` | Enables SSL for the pg pool (needed for RDS) | No | `true` | unset = no SSL | No |
| `AUTH_SECRET` | NextAuth JWT signing secret | Yes | random 32+ byte base64 | — | **Yes — critical** |
| `NEXTAUTH_URL` | Canonical app URL, used to build absolute links (invite/reset emails) and required for Auth.js host trust behind a proxy | Yes | `https://tradeshow-agent.gtmtechsol.ai` | `http://localhost:3000` (code fallback in some routes) | No |
| `AI_PROVIDER` | Selects the AI backend | No | `gemini` | `gemini` | No |
| `GEMINI_API_KEY` | Google Gemini API key | Yes (if AI features used) | — | — (throws) | **Yes** |
| `GEMINI_MODEL` | Gemini model name | No | `gemini-2.5-flash` | `gemini-2.5-flash` | No |
| `APOLLO_API_KEY` | Apollo.io API key | Yes (if enrichment used) | — | — (throws) | **Yes** |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot private app token | Yes (if CRM sync used) | — | — | **Yes** |
| `HUBSPOT_PIPELINE_ID` | Target HubSpot deal pipeline | Yes (if deals created) | — | — | No |
| `HUBSPOT_STAGE_ID` | Target HubSpot deal stage | Yes (if deals created) | — | — | No |
| `AWS_REGION` | AWS region for all SDK clients | Yes | `eu-central-1` | — | No |
| `AWS_ACCESS_KEY_ID` | AWS access key (local dev only) | No in prod | — | falls back to instance role | **Yes** |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (local dev only) | No in prod | — | falls back to instance role | **Yes** |
| `AWS_S3_BUCKET` | S3 bucket for uploads | Yes | `tradeshow-agent-audio-eu` | — (throws) | No |
| `AWS_S3_AUDIO_PREFIX` | S3 key prefix for voice notes | No | `voice-notes` | `voice-notes` | No |
| `AWS_S3_BUSINESS_CARD_PREFIX` | S3 key prefix for card images | No | `business-cards` | `business-cards` | No |
| `AWS_S3_AVATAR_PREFIX` | S3 key prefix for avatars | No | `avatars` | `avatars` | No |
| `AWS_TRANSCRIBE_OUTPUT_BUCKET` | Bucket for Transcribe job output | Yes (if transcription used) | — | — | No |
| `AWS_TRANSCRIBE_OUTPUT_PREFIX` | Key prefix for Transcribe output | No | `transcripts` | `transcripts` | No |
| `AWS_TRANSCRIBE_LANGUAGE_CODE` | Language for transcription | No | `en-GB` | `en-GB` | No |
| `EMAIL_PROVIDER` | Selects the email backend | No | `ses` | unset → console logging only, no real send | No |
| `EMAIL_FROM` | Sender address for SES | Yes (if `EMAIL_PROVIDER=ses`) | `info@gtmtechsol.com` | `noreply@gtmtechsol.ai` (code fallback — **not actually verified in SES**, see [11-integrations.md](11-integrations.md)) | No |

## Notes

- **`HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` were confirmed empty** in the local `.env.local` during this project's session work, despite a prior status doc claiming they'd been added — verify before assuming CRM sync end-to-end will work.
- **`AUTH_SECRET`** must be different between dev and production — never reuse a dev value in production. A fresh one was generated specifically for the production deploy.
- **AWS credentials**: in production, the EC2 instance role supplies credentials automatically (no `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` needed or present on the box) — these two vars are only meaningful for local development.
- No `.env.example` file currently exists in the repo — this table is the closest thing to one. Consider adding one (see [19-known-limitations.md](19-known-limitations.md)).
