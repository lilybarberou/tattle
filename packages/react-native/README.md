# @tattle/react-native

Tattle's bug report and feedback widget for React Native and Expo apps.

Users tap a floating button, choose **Report a bug** or **Suggest an idea**, write a message and send it. A bug report comes with a screenshot of the screen they were on. Users can annotate it (rectangle, circle, arrow, pen, blur) or remove it. Each report also carries the recent console logs, uncaught errors, network requests, the device and app version, and the user and context your app provides.

- Works with Expo (including Expo Go) and bare React Native, iOS and Android
- French and English UI, light and dark themes that follow the system or your app
- Themable to look like part of your app: colors, fonts, corner radius and texts
- Pure JavaScript: its only native modules are `react-native-view-shot` (screenshots) and `react-native-svg` (icons and annotations), both part of Expo Go

## Install

`@tattle/react-native` is not on npm yet. Until it is, build a package file from this repository and install it in your app:

```sh
# In the Tattle repository
pnpm install
pnpm --filter @tattle/react-native build
pnpm --filter @tattle/react-native pack --pack-destination ~/Downloads

# In your app
npx expo install ~/Downloads/tattle-react-native-0.1.0.tgz react-native-view-shot react-native-svg
```

On bare React Native, use `npm install` with the same packages, then `npx pod-install`.

Wrap your app with the provider, around your navigation. What it wraps is what screenshots show.

```tsx
import { TattleProvider } from "@tattle/react-native";

export default function App() {
  return (
    <TattleProvider projectKey="pk_..." apiUrl="https://tattle.example.com">
      <NavigationContainer>{/* … */}</NavigationContainer>
    </TattleProvider>
  );
}
```

The SDK records console logs and requests from the moment it is imported. Import it near the top of your entry file to keep the early ones.

## Identify the user and name the screens

```ts
import { Tattle } from "@tattle/react-native";

// After sign-in, so every report says who sent it. Extra keys become traits.
Tattle.identify({ id: user.id, email: user.email, name: user.name, plan: user.plan });
Tattle.identify(null); // after sign-out

// Attached to every report, shallow-merged.
Tattle.setContext({ tenant: "acme" });
```

Reports show the screen they came from once you name it on every navigation:

```tsx
// React Navigation
const navigationRef = useNavigationContainerRef();

<NavigationContainer
  ref={navigationRef}
  onStateChange={() => Tattle.setScreen(navigationRef.getCurrentRoute()?.name)}
>

// Expo Router, in the root layout
const pathname = usePathname();
useEffect(() => Tattle.setScreen(pathname), [pathname]);
```

## Options

```ts
<TattleProvider
  projectKey="pk_..."                  // required
  apiUrl="https://tattle.example.com"  // required: your Tattle server
  showButton={true}                    // false: open the form yourself with Tattle.open()
  buttonSide="right"                   // edge the button starts on: "left" | "right"
  locale="fr"                          // "fr" | "en", default from the device language
  accentColor="#2f55c9"                // any React Native color, same as theme.accent
  theme={{ ... }}                      // colors, fonts, corner radius: see below
  colorScheme="system"                 // "light" | "dark" | "system"
  strings={{ title: "Report a problem" }}  // replaces any text
  backgroundColor="#ffffff"            // behind transparent screens; default white, black in dark mode
  app={{ name: "Shop", version: "1.4.2", build: "87" }}
>
```

Users can drag the button along the screen edges when it covers something. To use your own entry point instead, for example in a settings screen or on a shake gesture, set `showButton={false}` and call:

```ts
Tattle.open();                    // the form, on "Report a bug"
Tattle.open({ type: "feature" }); // on "Suggest an idea"
Tattle.close();
```

The app's name, version and build number are read from `expo-application` when it is installed. Otherwise pass `app`, for example from `react-native-device-info`.

## Match your app's design

Give the widget your design tokens, and it reads like a screen of your app:

```tsx
<TattleProvider
  projectKey="pk_..."
  apiUrl="https://tattle.example.com"
  showButton={false}                        // open it from your own menu item
  colorScheme={appScheme}                   // follows your app's theme switch
  theme={{
    accent: colors.primary,
    accentText: colors.onPrimary,
    background: colors.card,
    text: colors.text,
    mutedText: colors.textSecondary,
    border: colors.border,
    surface: colors.muted,
    danger: colors.error,
    dangerBackground: colors.errorContainer,
    backdrop: "rgba(0, 0, 0, 0.5)",
    dark: { background: "#111", text: "#eee" }, // optional, see below
    fontFamily: "Inter_400Regular",
    fontFamilyBold: "Inter_600SemiBold",
    radius: 8,                              // fields and cards
    buttonRadius: 999,                      // pill buttons
  }}
  strings={{ title: "Something wrong?", send: "Send to the team" }}
>
```

- Every key is optional. The colors you leave out keep their default.
- **Dark mode.** The colors at the top level apply to both schemes; `dark` replaces some of them in dark mode. If your app has its own light/dark switch, pass its current value to `colorScheme`: the widget re-renders with it. When you set surface colors (`background`, `text`…) without `dark`, the widget stays light unless you pass `colorScheme`, so your light colors never mix with its default dark ones.
- **Fonts.** Load them in your app as usual (`expo-font`, `useFonts`) and pass their names. On Android, `fontWeight` has no effect on most custom fonts: give the bold file as `fontFamilyBold`, used for titles, labels and buttons.
- **Texts.** `strings` replaces any text by its key, in any language. The keys are in [`src/i18n.ts`](src/i18n.ts) and typed as `TattleStrings`.
- **Entry point.** For the least "third-party" feel, set `showButton={false}` and open the form from your own UI with `Tattle.open()`.

The annotation editor keeps its dark, full-screen look; it uses your accent, fonts and button radius.

## Hide sensitive content from screenshots

Wrap anything that must never leave the device in `<TattleMask>`. While the screen is captured, a solid block covers it.

```tsx
import { TattleMask } from "@tattle/react-native";

<TattleMask>
  <Text>{iban}</Text>
</TattleMask>
```

Users can also blur any area in the annotation editor before sending.

## What is sent

Submitting a report sends `POST {apiUrl}/api/v1/ingest`, the same endpoint as the web widget. See the [ingest API reference](../../docs/INGEST-API.md) for every field. In short:

- **Console**: the last 200 `console.log/info/warn/error/debug` calls, with stacks for errors. The original methods still run.
- **Errors**: uncaught JavaScript errors (fatal or not), through React Native's global error handler. The app's own handler still runs. In release builds on Hermes, unhandled promise rejections too; in development React Native already logs them as warnings.
- **Network**: the last 100 `fetch` and `XMLHttpRequest` calls: method, URL, status (0 on failure), duration. Never bodies or headers. Query values whose name looks secret (`token`, `key`, `password`, `session`, `code`…) are replaced with `[redacted]`.
- **Device**: platform, OS version, model and manufacturer, phone or tablet, screen size and pixel ratio, font scale, language, time zone, color scheme, React Native version and engine. With `expo-device` installed, the exact model name (for example "iPhone 16 Pro").
- **Screen**: the name from `Tattle.setScreen`, sent as `pageUrl`.
- **Screenshot**: a JPEG of the provider's content, bug reports only, unless the user removed it.

## Development

```sh
pnpm --filter @tattle/react-native build      # dist/
pnpm --filter @tattle/react-native typecheck
pnpm --filter @tattle/react-native test       # collectors and payload, in Node
```

## License

MIT
