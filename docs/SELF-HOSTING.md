# Self-hosting Tattle

This guide installs Tattle on a machine you control: a small cloud server, a home server, or your
own computer to try it out. You don't need the source code: Docker downloads a ready-made image.
If a word is unfamiliar, the [glossary](#glossary) at the end explains it.

What you get: the Tattle server (the dashboard, the widget your apps embed, the public feature
request pages and the MCP endpoint for your agents) and its database. Reports, screenshots and
votes stay on your machine.

> [!NOTE]
> Tattle is young. Keep [backups](#9-backups), and read the release notes before upgrading.

**Contents**

1. [What you need](#1-what-you-need)
2. [Download two files](#2-download-two-files)
3. [Fill in three settings](#3-fill-in-three-settings)
4. [Start Tattle](#4-start-tattle)
5. [Give it an address with HTTPS](#5-give-it-an-address-with-https)
6. [First visit: create the admin account](#6-first-visit-create-the-admin-account)
7. [Connect your apps and agents](#7-connect-your-apps-and-agents)
8. [Optional: email and S3](#8-optional-email-and-s3)
9. [Backups](#9-backups)
10. [Upgrades](#10-upgrades)
11. [Troubleshooting](#11-troubleshooting)
12. [All settings](#12-all-settings)

---

## 1. What you need

| | Details |
| --- | --- |
| **A machine** | Linux is the usual choice (Ubuntu, Debian…), 64-bit, Intel/AMD or ARM. macOS and Windows work with Docker Desktop. |
| **Docker** | [Docker Engine](https://docs.docker.com/engine/install/) or Docker Desktop, with Docker Compose v2. Check with `docker compose version`. |
| **Memory (RAM)** | 1 GB is enough for a small team: Tattle uses about 200 MB, Postgres a little more. |
| **Disk** | Mostly screenshots, around 100 to 500 KB per report. 10 GB lasts a long time. |
| **A domain name and HTTPS** | Needed when your apps' users are on the internet, for example `tattle.example.org` pointing to your server. Not needed to try Tattle on your own computer. A [hosting panel](#on-a-hosting-panel-easypanel-coolify-dokploy) can give you an address without a domain. |

Using a hosting panel such as EasyPanel, Coolify or Dokploy? Skip to
[On a hosting panel](#on-a-hosting-panel-easypanel-coolify-dokploy): you don't need steps 2 to 4.

## 2. Download two files

On the machine that will run Tattle, make a folder and download the Compose file and the example
settings into it:

```sh
mkdir tattle && cd tattle
curl -fsSLO https://raw.githubusercontent.com/lilybarberou/tattle/main/deploy/compose.yaml
curl -fsSL https://raw.githubusercontent.com/lilybarberou/tattle/main/deploy/.env.example -o .env
```

All the commands below are typed in this folder.

## 3. Fill in three settings

Open `.env` in a text editor (for example `nano .env`; save with <kbd>Ctrl</kbd>+<kbd>O</kbd>,
quit with <kbd>Ctrl</kbd>+<kbd>X</kbd>). In the **REQUIRED** block at the top, fill in three
values:

| Setting | What to put |
| --- | --- |
| `BETTER_AUTH_URL` | The address people will type to reach Tattle, for example `https://tattle.example.org`. To try Tattle on this computer only, use `http://localhost:3000`. |
| `BETTER_AUTH_SECRET` | A long random secret. Generate one with `openssl rand -base64 32` and paste the result. |
| `POSTGRES_PASSWORD` | A password for the database. Generate one with `openssl rand -hex 24`. |

> [!IMPORTANT]
> **Never change `BETTER_AUTH_SECRET` afterwards, and keep a copy of `.env` somewhere safe.**
> Sessions and the setup code depend on it: changing it signs everyone out.
>
> `POSTGRES_PASSWORD` is applied only the very first time the database is created. Changing it in
> `.env` later does not change the database's password, and Tattle will no longer connect.

Everything else in the file is optional. You can come back to it later.

## 4. Start Tattle

```sh
docker compose up -d
```

The first time, Docker downloads the images (a few hundred MB). Then it starts two services:

| Service | Role |
| --- | --- |
| `postgres` | The database (PostgreSQL 17). |
| `app` | Prepares the database, then serves the dashboard, the widget and the API on port 3000 of this machine only (`127.0.0.1`). |

Check that everything is up:

```sh
docker compose ps
```

Both should say `running`, and `app` becomes `healthy` after about 20 seconds. To see what's
happening, read the logs (press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop reading; Tattle keeps
running):

```sh
docker compose logs -f app
```

**Trying it on your own computer?** If you set `BETTER_AUTH_URL=http://localhost:3000`, open
<http://localhost:3000> now and jump to [step 6](#6-first-visit-create-the-admin-account).

## 5. Give it an address with HTTPS

For safety, Tattle only listens on the machine itself (`127.0.0.1:3000`). To reach it from the
internet, put a **reverse proxy** in front: a program that receives visitors on your domain,
handles the HTTPS certificate, and passes requests to Tattle.

### With the bundled Caddy (simplest)

1. Point your domain (for example `tattle.example.org`) to your server's IP address, at your
   domain registrar (a DNS "A" record). Ports 80 and 443 must be free and open.
2. In `.env`, set:

   ```sh
   BETTER_AUTH_URL=https://tattle.example.org
   DOMAIN=tattle.example.org
   TRUST_PROXY=true
   ```

3. Start Tattle with the `https` profile:

   ```sh
   docker compose --profile https up -d
   ```

Caddy gets a free certificate (Let's Encrypt) and renews it on its own. Open
`https://tattle.example.org`. From now on, add `--profile https` to every `up` command.

### With your own reverse proxy (nginx, Traefik, Caddy…)

Any proxy works if it:

- **forwards to `127.0.0.1:3000`** with the usual `Host`, `X-Forwarded-For` and
  `X-Forwarded-Proto` headers;
- **accepts request bodies of up to 12 MB** (a report with its screenshot).

For nginx, inside your `server { … }` block:

```nginx
client_max_body_size 12m;

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then set `BETTER_AUTH_URL=https://your-domain` and `TRUST_PROXY=true` in `.env`, and apply with
`docker compose up -d`.

> [!WARNING]
> Set `TRUST_PROXY=true` only when a proxy sits in front of Tattle. It makes Tattle believe the
> visitor's IP from the `X-Forwarded-For` header, which anyone could fake if they reached Tattle
> directly.

### On a hosting panel (EasyPanel, Coolify, Dokploy…)

Panels run each container on their own and give it an HTTPS address, often without a domain of
your own. Create two services in one project:

| Service | Settings |
| --- | --- |
| **Database** | The panel's PostgreSQL service (version 16 or 17). Copy its *internal* connection URL. |
| **App** | Source: **Docker image** `ghcr.io/lilybarberou/tattle:latest`. Port **3000**, with the panel's HTTPS domain on it. A volume mounted at **`/data`** (screenshots live there). |

Give the app these environment variables:

```sh
DATABASE_URL=postgres://user:password@database-host:5432/dbname   # the internal URL from the database service
BETTER_AUTH_URL=https://the-address-the-panel-gave-you            # no trailing slash
BETTER_AUTH_SECRET=                                               # openssl rand -base64 32
TRUST_PROXY=true
```

The app prepares the database itself on every start, so there's no separate migration step.
Deploy, then go to [step 6](#6-first-visit-create-the-admin-account); the setup code is in the
app's logs in the panel.

<details>
<summary>EasyPanel, click by click</summary>

1. **Create project** → name it `tattle`.
2. **+ Service → Postgres**, name it `db`. Open it and copy the **Internal Connection URL**.
3. **+ Service → App**, name it `app`.
   - **Source**: *Docker Image*, `ghcr.io/lilybarberou/tattle:latest`.
   - **Environment**: the four variables above.
   - **Domains**: keep the generated `….easypanel.host` domain (or add yours), port `3000`.
     Put this exact address in `BETTER_AUTH_URL`.
   - **Mounts**: *Add Volume*, name `data`, mount path `/data`.
4. **Deploy**. Open **Logs** and look for the line starting with `[setup]`.

To upgrade later, press **Deploy** again: EasyPanel pulls the newest image.

</details>

## 6. First visit: create the admin account

Open your Tattle address. On a brand-new server, you land on **Create the admin account**.

The first account owns the server, so only someone who can read the server's logs may create it.
Find the **setup code** there:

```sh
docker compose logs app | grep setup
```

```
[setup] No account yet. Open https://tattle.example.org/login and create the admin account with this setup code: BCDF-GHJK-LMNP
```

Type it with your name, email and a password (8 characters or more). You can choose the code
yourself with `SETUP_CODE` in `.env`. It is useless once the admin account exists.

After that, sign-up is closed: invite your teammates from **Members** (set
`ALLOW_SIGNUP=true` to let anyone create an account instead).

Then create your first project. Its page shows the widget snippet.

## 7. Connect your apps and agents

| What | Where | How |
| --- | --- | --- |
| **The widget** | Project settings → *Install the widget* | Paste the `<script>` tag into your app, then call `Tattle.identify({ id, email, name })` after sign-in. List your app's address under *Allowed sites* before going live. |
| **An AI agent (MCP)** | Agents & API | `claude mcp add --transport http tattle https://your-domain/api/mcp`: the agent opens a browser to sign in and asks you to approve. Agents without a browser use an API token instead. |
| **Discord or Slack** | Project settings → *Discord and Slack* | Paste a channel's webhook URL. New reports, status changes and comments appear there. |
| **Your own server** | Project settings → *Webhooks* | Signed JSON events, retried if your server is down. See the [README](../README.md#webhooks). |
| **A public feature request page** | Project settings → *Public feature requests* | Turn it on and pick an address: `https://your-domain/portal/<name>`. |

## 8. Optional: email and S3

**Email.** Without email, invitations are links you copy and send yourself, and there's no
"Forgot your password?". With an SMTP server (your email host, Brevo, Resend, Postmark, Amazon
SES…), invitations and password resets are emailed, and voters hear when their idea ships. Set in
`.env`:

```sh
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_USER=…
SMTP_PASSWORD=…
SMTP_FROM="Tattle <tattle@example.org>"
```

**S3.** Screenshots are stored in the `storage` volume by default. To keep them in a bucket
instead (AWS S3, Cloudflare R2, Scaleway, OVH, Backblaze…), set `STORAGE_DRIVER=s3` and the
`S3_…` settings described in `.env`. The bucket stays private.

Apply any change with `docker compose up -d`. If something is wrong, the app stops and its logs
say what (see [Troubleshooting](#11-troubleshooting)).

## 9. Backups

Your data lives in two Docker volumes: `tattle_db` (the database) and `tattle_storage` (the
screenshots, unless you use S3). And keep a copy of `.env`.

### Make a backup

```sh
# 1. The database, as one file
docker compose exec -T postgres pg_dump -U tattle tattle > tattle-db-$(date +%F).sql

# 2. The screenshots, as one archive (skip with S3)
docker run --rm -v tattle_storage:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/tattle-files-$(date +%F).tar.gz -C /data .
```

Copy these files, and `.env`, somewhere else: another machine, a cloud drive. A daily `cron`
job running these two commands is a good habit.

### Restore a backup

```sh
docker compose stop app
docker compose exec -T postgres psql -U tattle -d tattle \
  -c 'drop schema public cascade; drop schema if exists drizzle cascade; create schema public;'
docker compose exec -T postgres psql -U tattle -d tattle < tattle-db-2026-11-11.sql
docker run --rm -v tattle_storage:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/tattle-files-2026-11-11.tar.gz -C /data'
docker compose up -d
```

## 10. Upgrades

```sh
docker compose pull
docker compose up -d
```

The app updates the database on start. [Make a backup](#make-a-backup) first.

`latest` follows each new release. To stay on one version, set `TATTLE_VERSION=0.1.0` (for
example) in `.env`, and change it when you choose to upgrade. Available versions are listed on the
[releases page](https://github.com/lilybarberou/tattle/releases).

> [!CAUTION]
> Never run `docker compose down -v` during an upgrade: `-v` erases the database and every
> screenshot. Plain `docker compose down` stops Tattle and keeps the data.

To reclaim disk space from old images afterwards: `docker image prune`.

## 11. Troubleshooting

Start with the logs: `docker compose logs --tail=100 app`.

| What you see | What to do |
| --- | --- |
| `Cannot start:` followed by a list, and `app` keeps restarting | Each line names a setting to fix in `.env`, for example `BETTER_AUTH_SECRET must be at least 32 characters`. Fix it, then `docker compose up -d`. |
| `Waiting for the database (…/30)` then `Migration failed` | Postgres isn't reachable. With Compose: `docker compose ps` should show `postgres` healthy. On a panel: check `DATABASE_URL` is the *internal* URL. |
| `password authentication failed` | `POSTGRES_PASSWORD` was changed after the database was created. Put the original back. |
| "Wrong setup code" | Copy the code again from `docker compose logs app \| grep setup`. If you changed `BETTER_AUTH_SECRET`, the code changed too. |
| Signing in does nothing, or "Invalid origin" | `BETTER_AUTH_URL` must be exactly the address in your browser, `https://` included and no trailing slash. |
| The widget says "This origin is not allowed" | Add your app's address (for example `https://shop.example.org`) to the project's *Allowed sites*. |
| "Too many reports" (429) behind a proxy, from many people at once | Set `TRUST_PROXY=true`, otherwise Tattle sees every visitor as the proxy's IP. |
| Screenshots disappear after a redeploy | Nothing is mounted at `/data`. Add the volume (or use S3). |
| Invitations aren't emailed | Expected without SMTP: copy the invitation link from **Members**. With SMTP, the logs show the error. |

## 12. All settings

After changing `.env`, apply it with `docker compose up -d`.

| Setting | Default | What it does |
| --- | --- | --- |
| `BETTER_AUTH_URL` | (required) | The public address of Tattle. |
| `BETTER_AUTH_SECRET` | (required) | Signs sessions and derives the setup code. 32 characters or more. |
| `POSTGRES_PASSWORD` | (required with Compose) | The bundled database's password. |
| `DATABASE_URL` | set by Compose | Your own Postgres instead: `postgres://user:password@host:5432/db`. |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy, to see visitors' real IPs. |
| `DOMAIN` | | The domain for the bundled Caddy (`--profile https`). |
| `TATTLE_VERSION` | `latest` | The image version to run. |
| `APP_BIND` / `APP_PORT` | `127.0.0.1` / `3000` | Where Tattle listens on the machine. `APP_BIND=0.0.0.0` makes it reachable at `http://<server-ip>:3000` without a proxy. |
| `SETUP_CODE` | derived | Your own code for creating the first account. |
| `ALLOW_SIGNUP` | `false` | `true` lets anyone create an account. |
| `MIN_PASSWORD_LENGTH` | `8` | Shortest password accepted, 6 to 128. |
| `PASSWORD_BREACH_CHECK` | `true` | Refuses passwords found in known data breaches. Only the first 5 characters of the password's hash leave the server. |
| `INGEST_LIMIT_PER_IP` | `20` | Reports per IP per 10 minutes. |
| `INGEST_LIMIT_PER_PROJECT` | `300` | Reports per project per hour. |
| `PORTAL_LIMIT_PER_IP` | `30` | Votes and ideas per IP per 10 minutes on public pages. |
| `REPORT_RETENTION_DAYS` | (keep all) | Deletes screenshots and logs of reports older than this. The message and the reporter stay. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM` | (no email) | Sending email. `SMTP_SECURE=true` for port 465. |
| `STORAGE_DRIVER` | `local` | `s3` to store screenshots in a bucket. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PREFIX` | | The bucket. `S3_ENDPOINT` for every provider except AWS; `S3_FORCE_PATH_STYLE=true` for MinIO, Garage and similar. |

## Uninstall

```sh
docker compose down        # stops Tattle, keeps the data
docker compose down -v     # stops Tattle and ERASES all data, for good
```

## Build the image yourself

Prefer not to download a ready-made image? From a copy of the source code:

```sh
git clone https://github.com/lilybarberou/tattle.git
docker build -t ghcr.io/lilybarberou/tattle:latest tattle
```

Then follow this guide as written: Compose uses your local image instead of downloading one.

## Glossary

| Word | Meaning |
| --- | --- |
| **Terminal** | The window where you type commands (Terminal on Mac, a shell over SSH on a server). |
| **Docker, container, image** | Docker runs each part of Tattle in its own isolated box (a container), started from a ready-made package (an image). |
| **Docker Compose** | Starts several containers together from one file (`compose.yaml`). |
| **Volume** | A storage space Docker keeps between restarts. Your data lives in volumes. |
| **Reverse proxy** | A program (Caddy, nginx…) that receives visitors on your domain with HTTPS and passes them to Tattle. |
| **HTTPS** | The secure version of a web address (`https://`). |
| **Widget** | The small "Send feedback" button Tattle adds to your app. |
| **MCP** | The protocol AI agents (Claude Code, Cursor…) use to read and update your issues. |
| **Webhook** | A message Tattle sends to another server (Discord, Slack, your agent) when something happens. |
| **Migration** | An automatic update of the database's structure when Tattle is upgraded. |
