# Changelog

Versions follow [semver](https://semver.org/). While the version is 0.x, a minor version may change the public API: such changes are listed under **Action required**.

The server accepts reports from every version listed here.

## 0.2.0 (2026-11-17)

No action required: existing apps keep working as they are after updating.

### Added

- `collect` on `TattleProvider` turns collectors off: `{ console: false }`, `{ network: false }` or `{ steps: false }`. All are on by default.
- `beforeSend(report)` on `TattleProvider` changes a report right before it is sent, or drops it when it returns `null` (or throws).

### Fixed

- Console logs are scrubbed of credentials before they are sent: JWTs, URL secrets, the value after `Bearer`, `Basic` or `Token`, and properties named like credentials (`authorization`, `cookie`, `password`, `accessToken`…).
- Serializing a console argument stops after 2,000 values, so one log of a large object no longer blocks the app; getters are not run.
- Two first reports sent at once now share one device key, so both show under **My reports**.

## 0.1.0 (2026-11-12)

First version: the floating button and form, annotated screenshots, screens visited, console logs, uncaught errors, network requests, device and release, theming, enter and exit animations, and **My reports** with the team's replies.
