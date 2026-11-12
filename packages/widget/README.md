# @tattle/widget

A drop-in bug report and feedback widget for any web app. It has no framework dependency and renders in a Shadow DOM.

Users click a floating button, choose **Report a bug** or **Suggest an idea**, and can take an annotated screenshot of the page (rectangle, circle, arrow, pen, blur, undo, clear). They write a message and send it. Each report also carries the recent console logs, JS errors, network requests, device info, and the user and context your app provides.

- Vanilla TypeScript. UI isolated in a closed Shadow DOM, with light and dark themes that follow `prefers-color-scheme` or your app
- Themable to look like part of your app: colors, font, corner radius, texts, and extra CSS
- French and English UI
- One runtime dependency: [`html-to-image`](https://github.com/bubkoo/html-to-image) (bundled in the script-tag build)
- About 20 KB gzipped for the script-tag build, `html-to-image` included

## Install

```html
<script
  src="https://tattle.example.com/widget.js"
  data-project-key="pk_..."
  data-api-url="https://tattle.example.com"
  defer
></script>
```

The script initializes itself from its `data-*` attributes and exposes `window.Tattle`.

| Attribute            | Maps to                                    |
| -------------------- | ------------------------------------------ |
| `data-project-key`   | `projectKey` (required for auto-init)      |
| `data-api-url`       | `apiUrl` (defaults to the script's origin) |
| `data-position`      | `position`                                 |
| `data-locale`        | `locale`                                   |
| `data-accent-color`  | `accentColor`                              |
| `data-color-scheme`  | `colorScheme`                              |
| `data-show-button`   | `"false"` sets `showButton: false`         |

With `defer`/`async` your code may run before the script has loaded. To call the API that early, add this stub first. Queued calls are replayed in order when the SDK loads:

```html
<script>
  window.Tattle = window.Tattle || { q: [] };
  ["init", "identify", "setContext", "setTheme", "setColorScheme", "open", "close", "destroy"].forEach(function (m) {
    Tattle[m] = Tattle[m] || function () { Tattle.q.push([m].concat([].slice.call(arguments))); };
  });
  Tattle.identify({ id: "u_42", email: "jane@acme.com", name: "Jane" });
</script>
```

## API

```ts
Tattle.init(options: {
  projectKey: string
  apiUrl?: string                        // server base URL; default: the script's origin
  position?: "bottom-right" | "bottom-left"   // default "bottom-right"
  showButton?: boolean                   // default true; when false, open the panel with Tattle.open()
  locale?: "fr" | "en"                   // default from navigator.language
  accentColor?: string                   // any CSS color, default "#2f55c9"; same as theme.accent
  theme?: TattleTheme                    // colors, font, corner radius: see "Match your app's design"
  colorScheme?: "light" | "dark" | "system"   // default "system"
  strings?: Partial<TattleStrings>       // replaces any text
  css?: string                           // extra CSS inside the Shadow DOM
  maskSelectors?: string[]               // extra selectors to mask in screenshots
}): void

Tattle.setTheme(theme: TattleTheme): void                       // replaces the theme, keeps the open form
Tattle.setColorScheme(scheme: "light" | "dark" | "system"): void

Tattle.identify(user: { id?: string; email?: string; name?: string; [trait: string]: unknown } | null): void
Tattle.setContext(context: Record<string, unknown>): void   // shallow-merged into previous context
Tattle.open(options?: { type?: "bug" | "feature" }): void
Tattle.close(): void
Tattle.destroy(): void
```

- You can call `identify`, `setContext`, `setTheme`, `setColorScheme` and `open` before `init`. They are stored and applied when `init` runs; a `theme` or `colorScheme` given to `init` wins.
- Calling `init` again replaces the current widget, for example to change locale or position.
- `destroy` removes the UI and restores the original `console`, `fetch` and `XMLHttpRequest`. It also clears buffers, user and context.
- When `identify` gives a user email, the form hides its optional email field.

## Match your app's design

The widget can take your app's colors, font, corner radius and wording, so it reads as part of your app.

```ts
Tattle.init({
  projectKey: "pk_...",
  showButton: false,                 // open it from your own button or menu
  theme: {
    accent: "#c2410c",               // primary buttons, selection, focus ring, launcher
    accentText: "#ffffff",           // text on accent
    background: "#fffaf3",           // panel and fields
    text: "#3b2f2f",
    mutedText: "#8a7560",            // hints and placeholders
    border: "#ead9c2",
    surface: "#f3e6d3",              // type switch, secondary buttons
    danger: "#b91c1c",
    dangerBackground: "#fef2f2",
    backdrop: "rgba(0, 0, 0, .4)",   // behind the bottom sheet on phones
    dark: { background: "#1c1917", text: "#f5f5f4" },   // optional, see below
    fontFamily: "inherit",           // your <body> font, or any font-family
    radius: 4,                       // fields and cards, px or any CSS length
    buttonRadius: 999,               // pill buttons
  },
  strings: { title: "Something wrong?", send: "Send to the team" },
});
document.querySelector("#feedback").addEventListener("click", () => Tattle.open());
```

- Every key is optional. The colors you leave out keep their default. Invalid colors are ignored with a console warning.
- **Dark mode.** The colors at the top level apply to both schemes; `dark` replaces some of them in dark mode. With `colorScheme: "system"` the widget follows `prefers-color-scheme`. If your app has its own switch, call `Tattle.setColorScheme("dark")` from it. When you set surface colors (`background`, `text`…) without `dark`, the widget stays light unless you pass `colorScheme`, so your colors never mix with its default dark ones.
- **Fonts.** Fonts loaded by your page (`@font-face`, Google Fonts) work inside the widget. `"inherit"` reads the computed font of `<body>`.
- **Texts.** `strings` replaces any text by its key, in any language. The keys are in [`src/i18n.ts`](src/i18n.ts) and typed as `TattleStrings`.

### Animations

`theme.animation` sets how the panel appears and disappears. A preset sets both: `"pop"` (the default: it fades in while growing a little), `"slide"`, `"fade"` or `"none"`. On phones, the default is `"slide"`: the bottom sheet comes up from the screen's edge.

```ts
Tattle.init({
  projectKey: "pk_...",
  theme: {
    animation: {
      enter: "slide",
      exit: "fade",                    // default: the entrance, played backwards
      duration: 260,                   // ms, default 180 (240 for the bottom sheet)
      exitDuration: 150,               // default: duration
      easing: "cubic-bezier(.34, 1.56, .64, 1)",   // any CSS easing
      exitEasing: "ease-in",           // default: easing
    },
  },
});
```

For your own motion, `enter` and `exit` also take [Web Animations keyframes](https://developer.mozilla.org/docs/Web/API/Web_Animations_API/Keyframe_Formats): the entrance goes from hidden to shown, the exit from shown to hidden. Without `exit`, the entrance's keyframes play backwards.

```ts
theme: {
  animation: {
    enter: [{ opacity: 0, transform: "translateX(40px)" }, { opacity: 1, transform: "none" }],
    exit: [{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }],
  },
}
```

The backdrop behind the bottom sheet fades along. With `prefers-reduced-motion`, the panel never animates. `Tattle.setTheme` changes the animation at runtime too.

### From your stylesheet

Each token is also a CSS variable the widget reads from the page, so you can map your design tokens without JavaScript, and let your own dark mode selector switch them:

```css
:root {
  --tattle-accent: hsl(var(--primary));
  --tattle-background: hsl(var(--popover));
  --tattle-text: hsl(var(--popover-foreground));
  --tattle-font-family: var(--font-sans);
  --tattle-radius: var(--radius);
}
.dark {
  --tattle-background: hsl(var(--popover));   /* set the dark values where your app sets its own */
}
```

Variables: `--tattle-accent`, `--tattle-accent-text`, `--tattle-background`, `--tattle-text`, `--tattle-muted-text`, `--tattle-border`, `--tattle-surface`, `--tattle-danger`, `--tattle-danger-background`, `--tattle-backdrop`, `--tattle-font-family`, `--tattle-radius`, `--tattle-button-radius` and `--tattle-shadow` (the panel's `box-shadow`). A value given to `init` wins over the variable. The variables apply in both schemes: if your page sets them for light only, also set them for dark, or pass `colorScheme: "light"`.

### Extra CSS

For anything else (sizes, spacing, the launcher's shape), `css` is added inside the Shadow DOM after the widget's own styles:

```ts
Tattle.init({
  projectKey: "pk_...",
  css: ".fb-launcher { border-radius: 12px } .fb-panel { width: 420px }",
});
```

It targets the widget's internal `fb-*` classes (see [`src/ui/styles.ts`](src/ui/styles.ts)), which can change between versions. Prefer the theme for what it covers.

## What is sent

Submitting a report sends `POST {apiUrl}/api/v1/ingest` with `Content-Type: application/json`:

```ts
{
  projectKey, type: "bug" | "feature", message,   // 1..5000 chars
  screenshot?,             // "data:image/jpeg;base64,…" (bug reports only, when captured)
  pageUrl, pageTitle?,     // URL with sensitive query values redacted
  reporter?: { id?, email?, name?, traits? },   // from identify(); extra keys → traits; typed email fills email
  context?,                // from setContext()
  device: { userAgent, browser, os, platform, language, languages, timezone,
            screen, viewport, colorScheme, online, deviceMemory?, connection? },
  console: [{ level, message, timestamp, stack? }],                  // last 200
  network: [{ method, url, status, durationMs, timestamp, error? }],  // last 100
  sdk: { name: "@tattle/widget", version: "0.1.0" }
}
```

The server answers `201 { id, issueNumber? }`. On an error status it answers `{ error }`, and the widget shows that message.

### Collectors

- **Console**: wraps `console.log/info/warn/error/debug`. The original methods still run. Arguments are serialized safely: Errors become `name: message` with their stack. Objects are stringified with circular references handled, a depth limit of 4, and strings cut to 1000 chars. Each message is capped at 4000 chars.
- **Errors**: uncaught errors, unhandled promise rejections and failed resource loads become `error` entries.
- **Network**: wraps `fetch` and `XMLHttpRequest`. It records only method, URL, status (0 on network failure), duration and timestamp, never bodies or headers. The widget's own requests are not recorded: the ingest call and the assets fetched while taking a screenshot.
- **Device**: a small built-in UA parser covers Chrome, Edge, Firefox, Safari and Opera on Windows, macOS, iOS, Android and Linux. Screen, viewport, timezone, color scheme and connection info are read when the report is sent.

## Privacy

- **URL redaction.** Query (and `#fragment`) parameters whose key matches `/token|key|secret|password|auth|session|code/i` have their value replaced with `[redacted]`. This applies to network entries and `pageUrl`.
- **Screenshot masking.** Elements matching any of these selectors are covered with a solid block in the screenshot:
  - `input[type=password]`
  - `[data-tattle-mask]`
  - `input[autocomplete^="cc-"]`
  - every selector in `maskSelectors`

  The block is painted on the captured pixels, using each element's on-screen box measured just before capture. The live page is never changed, so nothing needs restoring afterwards.
- Add `data-tattle-mask` to anything else that should never show in a screenshot:

  ```html
  <div data-tattle-mask>IBAN: FR76 …</div>
  ```

- Users can blur any other area themselves in the annotation editor.
- The widget's own UI is excluded from screenshots.

## Screenshot notes

- Only the visible viewport is captured, at the current scroll position. `position: fixed` elements stay in place.
- The pixel ratio is capped at 2.
- The final image is a JPEG, at most 1920 px wide, quality 0.85.
- Capture relies on `html-to-image` (SVG `foreignObject`). Known limits:
  - Cross-origin images without CORS headers come out blank.
  - Inner scroll containers are captured at their top.
  - `<iframe>` content is not captured.

## Development

```sh
pnpm --filter @tattle/widget build       # dist/widget.iife.js, dist/index.js, dist/*.d.ts
pnpm --filter @tattle/widget dev         # rebuild the IIFE on change
pnpm --filter @tattle/widget typecheck
pnpm --filter @tattle/widget demo        # serves demo/index.html (build first)
```

`demo/index.html` loads `../dist/widget.iife.js` with `data-api-url="http://localhost:3000"`. It has buttons that log, throw, call `fetch`/XHR, and call the widget API, plus fields that should be masked.

## License

MIT
