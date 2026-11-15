# End-to-end tests

Playwright drives the dashboard, the public pages and the widget the way people use them, against a production build of the app. Everything runs on this machine: nothing is sent to GitHub, Slack, Discord, an AI provider or Have I Been Pwned.

## Run

Requirements: Node 22.19+, pnpm 10, Docker, and Playwright's Chromium (`pnpm --filter web exec playwright install chromium` once).

```bash
pnpm install
pnpm test:e2e                    # from the repository root, or from apps/web
pnpm --filter web e2e:down       # stop and remove the e2e containers when done
```

`pnpm test:e2e` starts the containers of `docker-compose.e2e.yml`, builds the widget and the app, then runs `playwright test`, which starts the app and the fixtures server and stops them at the end.

The CI runs the same command on every push and pull request (job "End-to-end" in `.github/workflows/ci.yml`), with one retry: a test that only passes on its second try is reported as flaky. The Playwright report of a failed run is kept for 7 days as the `playwright-report` artifact.

While working on tests, from `apps/web`:

```bash
pnpm e2e:up                              # containers, once
pnpm e2e:build                           # after changing app or widget code
pnpm exec playwright test e2e/portal.spec.ts
pnpm exec playwright test --ui           # watch and debug
pnpm exec playwright show-report         # last run, with traces of failures
node e2e/a11y-summary.ts                 # accessibility warnings of the last run
E2E_WORKERS=4 pnpm exec playwright test  # more workers on a quiet machine (default 2)
```

## What runs where

| What                   | Where                                                | Notes                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App (production build) | `http://localhost:3100`                              | Started by `e2e/start-app.ts` with the environment in `e2e/config.ts` only: no `.env` file is read                                                                |
| Postgres               | `127.0.0.1:54329`, database `tattle_e2e`             | In memory (tmpfs), dropped and recreated by every run                                                                                                             |
| Mailpit                | SMTP `127.0.0.1:11025`, API `http://127.0.0.1:18025` | Tests read invitations, replies and resets here                                                                                                                   |
| Fixtures server        | `http://127.0.0.1:3101`                              | `e2e/fixtures-server.ts`: the customer's website with the widget (`/site?key=pk_…`), its API (`/api/ok`, `/api/broken`) and the webhook receiver (`/hooks/<box>`) |

These ports differ from `docker-compose.dev.yml` (5434, 1026, 8026, 9030) and from `pnpm dev` (3000), so the suite can run next to a dev server without touching its data. `playwright.config.ts` refuses to start if any URL in `e2e/config.ts` is not on this machine.

The app runs with sign-up closed (as in production), `PASSWORD_BREACH_CHECK=false`, `ALLOW_PRIVATE_URLS=true` (webhooks to the fixtures server), `TRUST_PROXY=true`, raised ingest limits and a fixed `SETUP_CODE`.

## How the tests are written

- **One test, one journey**, in `test.step`s that read like the journey. `first-run.spec.ts` runs first, alone, on the empty database (setup code, onboarding); every other test seeds its own person, organization and project straight into the database (`support/seed.ts`), with unique names and emails, so tests run in parallel without seeing each other.
- **Accessible locators**: `getByRole` with the accessible name, `getByLabel`. Regions, dialogs and lists scope them.
- **No fixed waits**: web-first assertions, `expect.poll` for emails and webhook deliveries, and confirmations (a toast, a new state) before leaving a page.
- **Fixtures** (`support/fixtures.ts`): `workspace`, `dashboard` (signed in as its owner), `signedInPage(user)`, `openSite(...)` (the widget, in a context of its own), `a11y(page, label)`, and `sendReport(...)` (the public ingest API).
- **Hydration**: the dashboard is rendered on the server; `goto` and `reload` on app pages wait until React has hydrated `<main>`, so no click is lost.
- **Per-IP limits**: each browser context sends its own `X-Forwarded-For`, so Better Auth's sign-in limit never carries from one test to another. Not on the customer's website: an extra header on the widget's cross-origin requests would fail CORS.
- **The widget's shadow root** is closed. On the customer's website only, tests create shadow roots open (an init script), so the widget is reached by role and name like the rest.
- **Accessibility**: `a11y(page, label)` runs axe (WCAG 2.2 AA and best practices) on the pages and widget views a journey crosses. It never fails a test: violations are attached to the report and printed once per worker; `node e2e/a11y-summary.ts` lists them.

## Journeys

| File                         | Journey                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `first-run.spec.ts`          | Setup code, admin account, onboarding (organization and project), closed sign-up, sign out and in                                      |
| `central.spec.ts`            | Widget report with annotated screenshot, console and network → Triage → accept → comment → reply → email and widget → reporter answers |
| `csp.spec.ts`                | The widget on a page with a strict Content-Security-Policy: screenshot and report, no violation                                        |
| `triage.spec.ts`             | Decline, accept from the keyboard, merge a duplicate; issue list and overview                                                          |
| `invitations.spec.ts`        | Invitation by email, the signed link only, existing accounts, canceled invitations, members cannot invite                              |
| `roles.spec.ts`              | What members may do; what only owners and admins may                                                                                   |
| `conversation-email.spec.ts` | Reporter answers from the emailed link; stopping emails                                                                                |
| `auth.spec.ts`               | Password reset by email, other sessions signed out                                                                                     |
| `github-sync.spec.ts`        | Pull requests that fix issues, from signed deliveries: In review, then Done when merged                                                |

## Troubleshooting

- **"http://localhost:3100/health is already used"**: an app from an interrupted run is still up. `lsof -nP -iTCP:3100 -sTCP:LISTEN` shows it; stop it, then run again.
- **Timeouts when the machine is busy** (other test suites, builds): run with fewer workers, `E2E_WORKERS=1`.
- **"Postgres for e2e is not up"**: `pnpm e2e:up`.
