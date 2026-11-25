# Changelog

Versions follow [semver](https://semver.org/). While the version is 0.x, a minor version may change the public API: such changes are listed under **Action required**.

The server accepts reports from every version listed here.

## Unreleased

### Action required

- The package is renamed `@tattlehq/react-native` (it was `@tattle/react-native`), the name it will have on npm. In your app, replace the dependency and every `from "@tattle/react-native"` import. The tarball is now `tattlehq-react-native-<version>.tgz`. Reports now say `sdk.name: "@tattlehq/react-native"`; the server accepts both names.

## 0.2.0 (2026-11-17)

No action required: existing apps keep working as they are after updating.

### Added

- `collect` on `TattleProvider` turns collectors off: `{ console: false }`, `{ network: false }` or `{ steps: false }`. All are on by default.
- `beforeSend(report)` on `TattleProvider` changes a report right before it is sent, or drops it when it returns `null` (or throws).
- A bug report can carry an image from the photo library instead of the automatic screenshot: **Choose an image** when there is no screenshot, **Replace with an image** next to one. The image is annotated in the same editor and downscaled to fit the server's limits. Apps must install `expo-image-picker` (`npx expo install expo-image-picker`) to get the option; without it, the form is unchanged. New texts: `captureScreen`, `chooseImage`, `captureOrPickHint`, `replaceShot`, `imageAlt`, `pickFailed`, `imageTooLarge`.

### Fixed

- Console logs are scrubbed of credentials before they are sent: JWTs, URL secrets, the value after `Bearer`, `Basic` or `Token`, and properties named like credentials (`authorization`, `cookie`, `password`, `accessToken`…).
- Serializing a console argument stops after 2,000 values, so one log of a large object no longer blocks the app; getters are not run.
- Two first reports sent at once now share one device key, so both show under **My reports**.
- A report the server would refuse for its size (a screenshot over 8 MB or not a PNG, JPEG or WebP data URL, or more than 12 MB in all, for example after `beforeSend`) is no longer sent: the form says so.

## 0.1.0 (2026-11-12)

First version: the floating button and form, annotated screenshots, screens visited, console logs, uncaught errors, network requests, device and release, theming, enter and exit animations, and **My reports** with the team's replies.
