# React Native playground

A small Expo app to try `@tattlehq/react-native` (in [`packages/react-native`](../../packages/react-native)) without another app around it. It is the React Native counterpart of the web widget's demo (`pnpm --filter @tattlehq/widget demo`).

It uses the SDK's TypeScript sources directly: save a file in `packages/react-native/src` and the app reloads with the change. No build, no package file.

What it shows:

- **Playground** (home): open the form (`Tattle.open()`), console logs of every level and one with a token to scrub, uncaught errors, failing and successful requests (`fetch` and `XMLHttpRequest`), a custom step (`addBreadcrumb`).
- **Checkout**: a card number and an IBAN inside `<TattleMask>`, and a "Pay" button whose request fails.
- **Account**: "Help & feedback" opening the form from a settings screen, `identify` and `setContext`, and switches for the widget's language, color scheme and floating button.

Screens are followed with `Tattle.trackNavigation` (React Navigation), so each report shows the screen it came from and the steps before it.

It runs in **Expo Go** (Expo SDK 58, the SDK the Pawky and Ruban apps use): no native build.

## Run it

Requirements: those of the repository (Node, pnpm, Docker for the server), plus Xcode with an iOS Simulator, or Android Studio with an emulator.

```bash
# 1. A local Tattle server (see "Develop" in the main README)
docker compose -f docker-compose.dev.yml up -d
pnpm dev                                   # http://localhost:3000

# 2. A project key: create a project in the dashboard; its settings page shows
#    the public key (pk_...).
cp apps/rn-playground/.env.example apps/rn-playground/.env
#    then set EXPO_PUBLIC_TATTLE_PROJECT_KEY in it

# 3. The app
pnpm playground:ios                        # or playground:android
```

`pnpm playground:ios` starts Expo, installs Expo Go on the booted iOS Simulator if needed (it boots one when none is running), and opens the app. `pnpm playground` starts Expo only: press `i` or `a` to open a simulator, `shift+i` to choose which one, or scan the QR code with Expo Go on a phone.

If `--ios` cannot open the app (Expo needs the Mac's Automation permission to check that Simulator is running), start Expo with `pnpm playground` and open it from a second terminal:

```bash
xcrun simctl openurl booted exp://127.0.0.1:8081
```

## Point it at a server

The playground reads two variables from `apps/rn-playground/.env` (Expo loads it when it starts: restart Expo after a change):

| Variable | Default |
| --- | --- |
| `EXPO_PUBLIC_TATTLE_URL` | A local `pnpm dev`: `http://localhost:3000` on the iOS Simulator, `http://10.0.2.2:3000` (the Mac, seen from the emulator) on Android |
| `EXPO_PUBLIC_TATTLE_PROJECT_KEY` | None: the app says so, and the server refuses reports |

On a real phone, `localhost` is the phone: set `EXPO_PUBLIC_TATTLE_URL` to your computer's LAN address, and start the server so it listens on it (`pnpm --filter web dev --host`), or use a deployed server. The **Account** screen shows the URL and key in use.

## Add photos to the simulator

To try **Choose an image** and **Replace with an image**, put images in the simulator's photo library:

```bash
xcrun simctl addmedia booted ~/Desktop/screenshot.png ~/Pictures/photo.jpg ~/Pictures/photo.heic
```

`booted` is the running simulator; give its name or UDID when several are running (`xcrun simctl list devices booted`). On the Android emulator, drag the files onto its window, or `adb push photo.jpg /sdcard/Pictures/` then reopen the photo picker.

Useful images to try: a phone screenshot (kept at its size), a large photo such as 4000×3000 (downscaled to 2,560 px on its longest edge), and a HEIC photo from an iPhone.

## Where things are

- `src/index.ts`: imports the SDK first, so it records logs and requests from the start.
- `src/App.tsx`: the provider and the navigation.
- `metro.config.js`: resolves `@tattlehq/react-native` to `packages/react-native/src`, and the SDK's imports (`react`, `react-native`, `react-native-svg`…) to this app's copies, as in an installed app. The SDK's own `react` is a test dependency of another version: bundling it too would break hooks.
- `tsconfig.json`: the same mapping for TypeScript, so `pnpm typecheck` checks the app against the SDK's sources, without a build.

The playground is a development tool: it is not published, and it is not part of the Docker image.
