# Deployment Diagram

Reflects the actual running infrastructure as verified in `docs/production-gap-analysis.md` (2026-06-27 inspection) — not assumed from docs alone.

## Infrastructure topology

```mermaid
flowchart TB
    Internet["Internet"]

    subgraph "AWS eu-central-1"
        subgraph "EC2 i-0ddfdeaef544e8bdd (t3.small, 3.73.2.52)"
            Nginx["Nginx<br/>reverse proxy, TLS termination"]
            Docker["Docker container: tradeshow-agent<br/>image tag: s3fix (current)<br/>port 3000"]
            Swap["2GB swapfile<br/>(added after OOM incident)"]
            Nginx --> Docker
        end

        RDS[("RDS PostgreSQL<br/>tradeshow-agent-prod.cnec08ekae5z.eu-central-1.rds.amazonaws.com")]
        S3Bucket[("S3 bucket<br/>tradeshow-agent-audio-eu")]
        Transcribe["Transcribe service"]
        SES["SES (sandbox mode)<br/>verified sender: info@gtmtechsol.com"]
        IAMRole["EC2 Instance Role<br/>(no static AWS keys in production)"]

        Docker -->|DATABASE_SSL=true| RDS
        Docker --> S3Bucket
        Docker --> Transcribe
        Docker --> SES
        IAMRole -.->|credentials resolved via instance role| Docker
    end

    Internet -->|HTTPS tradeshow-agent.gtmtechsol.ai| Nginx
```

## Deploy flow (manual, no CI/CD pipeline)

```mermaid
flowchart LR
    Dev["Developer machine"] -->|git push| GitHub["GitHub: SudheerGTM/tradeshow-revenue-agent (main)"]
    Dev -->|SSH + docker build| EC2["EC2 instance"]
    GitHub -.->|manually pulled, not automatic| EC2
    EC2 -->|docker build -t tradeshow-agent:TAG| Image["New image, ad-hoc tag<br/>(e.g. wf, iam, s3fix — see process gap below)"]
    Image -->|docker run, replace container| Running["Running container"]
```

**Known process gap (see `docs/production-gap-analysis.md`):** image tags are ad-hoc labels (`wf`, `iam`, `qc`, `s3fix`, etc.) with no link back to the git commit they were built from. Recommended fix: tag images with the git short-SHA at build time so "what's actually running" can be answered without SSHing in and grepping compiled bundles.

## Database migrations (manual, no runner)

```mermaid
flowchart LR
    SQLFiles["drizzle/*.sql files in repo"] -->|applied by hand, in order, per environment| LocalDB["Local dev Postgres (port 5433)"]
    SQLFiles -->|applied by hand, in order, per environment| ProdDB["Production RDS"]
```

No automated migration runner exists yet — see `docs/16-troubleshooting.md` known issue #2 and the migration strategy doc for the recommended path forward.

## Host resource notes

- t3.small = 2GB RAM. Swapfile (2GB) was added specifically because `next build` inside the EC2 instance OOM'd without it.
- Multiple old/unused Docker images accumulate on the host (`wf`, `iam`, `qc`, `qc2`, `latest`, dangling `<none>` images) — disk usage not currently monitored; recommend periodic `docker image prune`.
