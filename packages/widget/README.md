# @tattle/widget

A drop-in bug report and feedback widget for any web app. It has no framework dependency and renders in a Shadow DOM.

Users click a floating button, choose **Report a bug** or **Suggest an idea**, and can take an annotated screenshot of the page (rectangle, circle, arrow, pen, blur, undo, clear). They write a message and send it. Each report also carries the recent console logs, JS errors, network requests, device info, and the user and context your app provides.

- Vanilla TypeScript. UI isolated in a closed Shadow DOM, with light and dark themes that follow `prefers-color-scheme`
- French and English UI
- One runtime dependency: [`html-to-image`](https://github.com/bubkoo/html-to-image) (bundled in the script-tag build)
- About 20 KB gzipped for the script-tag build, `html-to-image` included

## Install

### Script tag

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
| `data-show-button`   | `"false"` sets `showButton: false`         |

With `defer`/`async` your code may run before the script has loaded. To call the API that early, add this stub first. Queued calls are replayed in order when the SDK loads:

```html
<script>
  window.Tattle = window.Tattle || { q: [] };
  ["init", "identify", "setContext", "open", "close", "destroy"].forEach(function (m) {
    Tattle[m] = Tattle[m] || function () { Tattle.q.push([m].concat([].slice.call(arguments))); };
  });
  Tattle.identify({ id: "u_42", email: "jane@acme.com", name: "Jane" });
</script>
```

### npm

```sh
pnpm add @tattle/widget
```

```ts
import { init, identify, setContext, open } from "@tattle/widget";
// or: import Tattle from "@tattle/widget";

init({ projectKey: "pk_...", apiUrl: "https://tattle.example.com" });
identify({ id: user.id, email: user.email, name: user.name, plan: user.plan });
setContext({ appVersion: "2.3.1", tenant: "acme" });
```

The collectors start when the module is evaluated. Import it as early as you can to capture early logs. On the server (SSR) the import does nothing.

## API

```ts
Tattle.init(options: {
  projectKey: string
  apiUrl?: string                        // server base URL; default: current origin (npm) / script origin (script tag)
  position?: "bottom-right" | "bottom-left"   // default "bottom-right"
  showButton?: boolean                   // default true; when false, open the panel with Tattle.open()
  locale?: "fr" | "en"                   // default from navigator.language
  accentColor?: string                   // any CSS color, default "#2f55c9"
  maskSelectors?: string[]               // extra selectors to mask in screenshots
}): void

Tattle.identify(user: { id?: string; email?: string; name?: string; [trait: string]: unknown } | null): void
Tattle.setContext(context: Record<string, unknown>): void   // shallow-merged into previous context
Tattle.open(options?: { type?: "bug" | "feature" }): void
Tattle.close(): void
Tattle.destroy(): void
```

- You can call `identify`, `setContext` and `open` before `init`. They are stored and applied when `init` runs.
- Calling `init` again replaces the current widget, for example to change locale or position.
- `destroy` removes the UI and restores the original `console`, `fetch` and `XMLHttpRequest`. It also clears buffers, user and context.
- When `identify` gives a user email, the form hides its optional email field.

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
