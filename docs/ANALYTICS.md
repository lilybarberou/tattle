# Analytics plan

What the team, and the agents working on Tattle, measure, where each answer lives, and under which stable name.

## Principles

- **Nothing leaves a self-hosted server unless its admin says so.** Tattle sends no analytics to any third party: no PostHog, no Google Analytics, nothing in the server, the widget or the SDKs. The only planned exception is anonymous telemetry that the admin turns on (see [Self-hosted instances](#self-hosted-instances)).
- **Usage is read from Tattle's own database.** Every report, issue, status change and actor (person, agent or system) is already stored. Agents read the aggregates through MCP; nobody re-sends them elsewhere.
- **No personal data in any metric**: counts, durations, versions and booleans only. No email, name, user id, IP, message or page content.
- **Stable names.** The names below (`get_stats` fields, counters, table columns, telemetry keys) are a contract for agents: add new ones, never rename or reuse one. A change is noted in this file.
- **Landing**: not measured for now. If it ever is, use an option without a third-party service (see [Landing](#landing)).

Status of each source: **live**, **planned** (with its target month), or **not planned**.

## Questions and where their answers live

### Product use (the team's instance and any self-hosted one)

| Question | Source | Name | Status |
|---|---|---|---|
| How many reports come in, of which type, from which project? | `get_stats` | `reports.total`, `reports.byType`, `reports.byDay` | Planned (December) |
| Is Triage keeping up? | `get_stats` | `triage.open`, `triage.oldestAgeHours`, `triage.medianTimeToTriageHours` | Planned (December) |
| How long does a fix take? | Overview page today; `get_stats` | `resolution.median30Days`, `resolution.median90Days`, `resolution.resolved30Days` | Live in the dashboard (Overview); planned in MCP (December) |
| Do agents really do the triage? | `get_stats`, from `activity.actor_type` | `actors.byAction` (`user` / `agent` / `system` per action) | Planned (December) |
| Are duplicates caught? | `get_stats` | `duplicates.suggested`, `duplicates.merged`, `duplicates.dismissed` | Planned (December) |
| Do fixed bugs come back? | `get_stats` | `regressions.count`, `regressions.byRelease` | Planned (December) |
| Which SDK versions and app releases are still sending reports? (compatibility policy) | `get_stats`, from `report.sdk` and `report.release` | `sdkVersions` (`name`, `version`, `reports`, `lastSeenAt`), `releases` | Planned (December) |
| Do reporters get an answer, and how fast? | `get_stats` | `conversations.waiting`, `conversations.medianFirstReplyHours` | Planned (December) |
| Are integrations healthy? | `get_stats` | `webhooks.failed`, `github.lastDeliveryAt` | Planned (December) |
| Do people open the widget and give up? | Widget counters stored on the Tattle server, aggregated per project and day, no identifier | `widget.opened`, `widget.screenshotTaken`, `widget.sent`, `widget.abandoned` (in `get_stats`) | Planned (January) |

`get_stats` is a read-only MCP tool: `get_stats { project, days }` (default 30 days). It answers from the database with the caller's access, so a token or OAuth client sees only its projects. Until it ships, the dashboard's **Overview** page shows the open count, the 30-day chart and the resolution medians.

### Open source adoption

| Question | Source | Name | Status |
|---|---|---|---|
| Is the repository getting attention, and from where? | OpenBot routine « Tattle : adoption GitHub chaque semaine » (Monday 09:15, Europe/Paris), table `tattle_adoption` | stars, forks, views and unique visitors, clones and unique cloners, top referrers, top pages (one row per week) | Live from 23 November 2026 (first run creates the table) |
| Are the SDKs installed? | Same routine, npm public download API | `@tattlehq/widget` and `@tattlehq/react-native` weekly downloads | Planned (January, once published) |
| Is the image pulled? | Same routine, GitHub package page | image pulls | Planned (January) |

GitHub keeps traffic for 14 days only: the weekly routine is what keeps the history.

### Self-hosted instances

| Question | Source | Name | Status |
|---|---|---|---|
| How many instances run, on which version and architecture? | Anonymous telemetry, **off by default**, turned on by the admin | `instanceId` (random), `version`, `arch` | Planned (January), needs the owner's approval of the principle, the question's text and the destination |
| Which features are used? | Same | `features.smtp`, `features.s3`, `features.aiDuplicates`, `features.githubSync`, `features.webhooks`, `features.portal` (booleans) | Same |
| How big are they? | Same | `projects`, `members`, `reportsPerWeek`, each rounded to a range | Same |

The admin sees the exact payload in the settings before turning it on; `TELEMETRY=false` turns it off for good. No name, domain, content or IP is stored.

### Landing

Not measured. If it ever needs to be, the options without a third-party service are:
- counts read from the host's own request logs (pages and referrers, no script in the page);
- a small aggregated counter on the team's own Tattle instance (page and referrer per day, no cookie, no identifier).

## Insights and dashboards

There is no analytics tool, so there are no external dashboards. The named views are:
- **Overview** (dashboard, per project): open issues, the 30-day chart and resolution medians.
- **`get_stats`** (MCP, per project): every product-use answer above, under the names listed.
- **`tattle_adoption`** (OpenBot table): the weekly adoption history.

## Changes

- 2026-11-17: first version. PostHog and any other third-party analytics ruled out for Tattle, landing included.
