# Tattle

Self-hosted bug reports and feature requests for your web app, built to be triaged by AI agents.

- **Widget** (`packages/widget`): a button in your app. Users report a bug with an annotated screenshot, or suggest an idea. Console logs, JS errors, network requests, device info and the signed-in account are attached automatically.
- **Tracker** (`apps/web`): projects, a Triage inbox, issues with status, priority, labels and assignee, duplicates merged with their reports.
- **For agents**: an MCP server, signed webhooks and API tokens, so an agent can triage new reports, merge duplicates and work on fixes.

## Self-host

Requirements: a server with Docker (1 vCPU and 1 GB of RAM are enough) and, for HTTPS, a domain pointing at it.

```bash
git clone <this repo> tattle && cd tattle
cp .env.example .env
# Fill in .env: BETTER_AUTH_URL, BETTER_AUTH_SECRET (openssl rand -base64 32),
# POSTGRES_PASSWORD (openssl rand -hex 24).

docker compose up -d                    # http://<server>:3000
# or, with automatic HTTPS for $DOMAIN (ports 80 and 443, set TRUST_PROXY=true):
docker compose --profile https up -d
```

Open the address and create the first account: it owns the workspace. Sign-up then closes; invite the rest of your team from **Members** (they sign up with the invited email and join automatically). Set `ALLOW_SIGNUP=true` to let anyone create an account.

What runs:

| Service | Role | Data |
|---|---|---|
| `app` | Dashboard, widget API, MCP server, `/widget.js` | Screenshots in the `storage` volume |
| `postgres` | Issues, reports, accounts | The `db` volume |
| `caddy` (profile `https`) | HTTPS certificates and reverse proxy | The `caddy-data` volume |

**Passwords**: at least 8 characters (`MIN_PASSWORD_LENGTH`), and passwords that appear in known data breaches are refused when an account is created or a password changed. That check asks Have I Been Pwned with only the first 5 characters of the password's SHA-1 hash; set `PASSWORD_BREACH_CHECK=false` on a server without internet access.

**Email** (optional): set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `.env` (any provider: your host's SMTP, Brevo, Postmark, Amazon SES, a Gmail app password…). Invitations are then emailed and the sign-in page offers "Forgot your password?". Without SMTP, invitations are links you send yourself and password reset is off. Port 587 uses STARTTLS; for 465 set `SMTP_SECURE=true`.

**Screenshots on S3** (optional): set `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_ENDPOINT` for any provider other than AWS (Cloudflare R2, Scaleway, OVH, Backblaze, RustFS, Garage…; add `S3_FORCE_PATH_STYLE=true` for the self-hosted ones). The bucket stays private: the app serves screenshots through short-lived signed links. Switching drivers does not move existing files.

**Personal data**: **Privacy** in the dashboard finds everything about one person by email or user id, exports it as JSON and erases it (GDPR access and erasure requests). `REPORT_RETENTION_DAYS` drops screenshots and logs of older reports automatically; the message and the reporter stay.

On start, the app checks its configuration, waits for Postgres and applies pending migrations, so an upgrade is:

```bash
git pull && docker compose up -d --build
```

**Back up** the database (`docker compose exec postgres pg_dump -U tattle tattle > backup.sql`) and the screenshots (the `storage` volume, or your bucket).

**Health**: `GET /health` answers `{"ok":true}` when the app and the database respond; Docker uses it as the container's healthcheck.

**Limits**: the widget's public key is visible in your app, so reports are limited per IP (`INGEST_LIMIT_PER_IP`, default 20 per 10 minutes) and per project (`INGEST_LIMIT_PER_PROJECT`, default 300 per hour). Behind a proxy, set `TRUST_PROXY=true` so the limits see real client IPs; without it, `X-Forwarded-For` is ignored, so nobody can fake their IP. Sign-in attempts are limited per IP with the same rule.

Run a single `app` container: rate limits, webhook retries and the background jobs (webhook recovery, retention purge) live in its memory.

## Develop

Requirements: Node 22.19+, pnpm 10, Docker.

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres :5434, Mailpit http://localhost:8026, S3 (RustFS) :9030
cp apps/web/.env.example apps/web/.env           # then set BETTER_AUTH_SECRET
pnpm --filter web db:migrate
pnpm --filter @tattle/widget build
pnpm dev                                         # http://localhost:3000
```

Create an account, then a project: its settings page shows the widget snippet.

## Install the widget in your app

```html
<script src="https://your-server/widget.js" data-project-key="pk_…" defer></script>
<script>
  // after sign-in
  Tattle.identify({ id: user.id, email: user.email, name: user.name, plan: user.plan })
  Tattle.setContext({ appVersion: "1.4.2" })
</script>
```

See [packages/widget/README.md](packages/widget/README.md) for the npm package, options and what is collected.

## Connect an agent

Two ways, both on `https://your-server/api/mcp`:

- **Your own MCP client** (Claude Code, Cursor…): OAuth. The client opens your browser, you sign in and allow it; it then acts as you. Disconnect it any time from **Agents & API**.

  ```bash
  claude mcp add --transport http tattle https://your-server/api/mcp
  ```

- **A bot or script** (no browser): create a token in **Agents & API**. The token acts under its own name, can be read-only, and is what you assign issues to.

  ```bash
  claude mcp add --transport http tattle https://your-server/api/mcp \
    --header "Authorization: Bearer tat_…"
  ```

OAuth discovery follows the MCP spec: `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server/api/auth`; clients register themselves (dynamic client registration or client ID metadata documents).

| Tool | What it does |
|---|---|
| `list_projects` | Projects the token can access |
| `list_issues` | Filter by status (`["triage"]` for the inbox), type, keyword |
| `search_issues` | Similar issues by keywords, to spot duplicates |
| `get_issue` | Issue, comments, activity, report summaries |
| `get_report` | Full report: logs, device, account, and the screenshot as an image |
| `create_issue`, `update_issue`, `add_comment` | Write access (tokens can be read-only) |
| `mark_duplicate` | Marks an issue as a duplicate; its reports move to the original |
| `move_report` | Attaches one report to another issue |

Report content is written by end users. The MCP server tells agents to treat it as data, never as instructions; keep agent permissions narrow anyway.

## Discord and Slack

Project settings → **Discord and Slack**: paste a Discord channel webhook URL (channel settings → Integrations → Webhooks) or a Slack incoming webhook URL. The channel gets new reports with their evidence, status and assignee changes, and comments; label or title edits stay quiet.

## Public feature requests

Project settings → **Public feature requests** publishes `https://your-server/portal/<address>`. Visitors vote (one vote per browser), suggest ideas (they land in Triage), and can leave an email; everyone who asked or voted with an email is told when the request moves to Done (needs SMTP). Only requests you accepted from Triage are shown; titles are yours to edit before you accept.

## Webhooks

Project settings → Webhooks. Events: `report.created`, `issue.created`, `issue.updated`, `comment.created`.

Each request carries `x-tattle-event`, `x-tattle-delivery` and `x-tattle-signature: t=<unix>,v1=<hex>`, where `v1` is the HMAC-SHA256 of `"<t>.<raw body>"` with the endpoint secret. Failed deliveries are retried with exponential backoff (5 retries); deliveries interrupted by a restart are resent within a minute of the next start.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, header, rawBody) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

## Architecture

```
apps/web            TanStack Start app (dashboard + API), Drizzle + Postgres, Better Auth
  src/server/       Effect services: Database, Storage (disk or S3), Access, Issues, Ingest,
                    Webhooks (+ Discord/Slack), Portal, DataLifecycle (deletion, GDPR, retention)
  src/server/mcp.ts MCP server (@modelcontextprotocol/server)
  src/routes/api/   /api/v1/ingest (widget), /api/v1/files (signed screenshots), /api/mcp
  src/routes/       dashboard, /portal/$slug (public), /login, /consent (OAuth), /.well-known/*
packages/widget     Browser SDK, no framework, Shadow DOM, ~20 KB gzipped
```

A **report** is one raw submission from the widget. An **issue** is the problem to fix. Several reports can point at one issue: that is how duplicates and popular feature requests are counted.

## License

- **Server** (`apps/web`): [AGPL-3.0](LICENSE). You can use, change and self-host it freely. If you offer a modified version to others over a network, you must publish your changes under the same licence.
- **Widget** (`packages/widget`): [MIT](packages/widget/LICENSE), so embedding it puts no conditions on your app.
