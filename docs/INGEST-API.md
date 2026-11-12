# Ingest API

Every report reaches Tattle through one request: `POST /api/v1/ingest`. The web widget (`@tattle/widget`) and the React Native SDK (`@tattle/react-native`) both use it. Native iOS and Android apps, Flutter, desktop apps or a backend can send reports the same way.

## Request

```http
POST https://your-server/api/v1/ingest
Content-Type: application/json
```

The project's **public key** (`pk_…`, in project settings) authenticates the request. It is meant to ship inside your app: it can only create reports.

```jsonc
{
  "projectKey": "pk_…",                 // required
  "type": "bug",                         // required: "bug" | "feature"
  "message": "Checkout button does nothing", // required, 1–5000 characters; the first line becomes the issue title
  "pageUrl": "Checkout",                 // required: a web address, or the screen name in a mobile app (max 4000)
  "pageTitle": "Checkout",               // optional (max 500)
  "screenshot": "data:image/jpeg;base64,…", // optional: PNG, JPEG or WebP data URL, at most 8 MB decoded
  "reporter": {                          // optional
    "id": "u_42",                        // max 200
    "email": "jo@example.com",           // max 320
    "name": "Jo Martin",                 // max 200
    "traits": { "plan": "pro" }          // any JSON object
  },
  "context": { "tenant": "acme" },       // optional: any JSON object
  "device": { },                         // required: any JSON object, see below
  "console": [                           // required, may be empty, at most 500 entries
    {
      "level": "error",                  // "log" | "info" | "warn" | "error" | "debug"
      "message": "TypeError: …",         // max 10,000
      "timestamp": 1731400000000,        // milliseconds since 1970
      "stack": "…"                       // optional, max 10,000
    }
  ],
  "network": [                           // required, may be empty, at most 300 entries
    {
      "method": "POST",                  // max 20
      "url": "https://api.example.com/cart", // max 4000
      "status": 500,                     // 0 when the request failed without a response
      "durationMs": 182,
      "timestamp": 1731400000000,
      "error": "Request timed out"       // optional, max 2000
    }
  ],
  "sdk": { "name": "my-ios-app", "version": "1.0.0" } // optional
}
```

The whole body may be up to 12 MB.

### `device`

The server stores any JSON object. The dashboard reads these fields when they are present:

| Field | Web | Mobile | Shown as |
|---|---|---|---|
| `browser: { name, version }` | ✓ | | Browser |
| `platform` | | `"ios"` or `"android"` | Marks the report as mobile |
| `app: { name, version, build }` | | ✓ | App, e.g. "Shop 1.4.2 (87)" |
| `manufacturer`, `model` | | ✓ | Device, e.g. "Google Pixel 9" |
| `os: { name, version }` | ✓ | ✓ | System |
| `viewport: { width, height }` | ✓ | ✓ | Window, or screen size on mobile |

Add anything else useful (locale, time zone, connection…): it appears in the report's **Device** tab and in what agents read through MCP.

## Responses

| Status | Body | Meaning |
|---|---|---|
| `201` | `{ "id": "…", "issueNumber": 12 }` | Saved; a new issue is in Triage |
| `400` | `{ "error": "…" }` | Invalid body, or a website the project does not allow |
| `404` | `{ "error": "Unknown project key" }` | |
| `413` | `{ "error": "Report is too large" }` | |
| `429` | `{ "error": "…" }` and a `Retry-After` header (seconds) | Rate limited: by default 20 reports per 10 minutes per IP, 300 per hour per project |

`error` messages are written for end users: you can show them as they are.

## Allowed sites

A project's **Allowed sites** only apply to requests that carry an `Origin` header, which browsers always send and pages cannot change. Native apps send none, so the list never blocks them. (Any non-browser client could send any `Origin` anyway: the list stops other websites from using your key, not scripts.)

## Examples

### Swift

```swift
var request = URLRequest(url: URL(string: "https://your-server/api/v1/ingest")!)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.httpBody = try JSONSerialization.data(withJSONObject: [
  "projectKey": "pk_…",
  "type": "bug",
  "message": message,
  "pageUrl": currentScreen,
  "device": [
    "platform": "ios",
    "os": ["name": UIDevice.current.systemName, "version": UIDevice.current.systemVersion],
    "app": [
      "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "",
      "build": Bundle.main.infoDictionary?["CFBundleVersion"] ?? "",
    ],
  ],
  "console": [],
  "network": [],
])
let (_, response) = try await URLSession.shared.data(for: request)

// A screenshot of the key window, as a data URL:
let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
  window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
}
let screenshot = "data:image/jpeg;base64," + image.jpegData(compressionQuality: 0.8)!.base64EncodedString()
```

### Kotlin (Android)

```kotlin
val body = JSONObject()
  .put("projectKey", "pk_…")
  .put("type", "bug")
  .put("message", message)
  .put("pageUrl", currentScreen)
  .put("device", JSONObject()
    .put("platform", "android")
    .put("os", JSONObject().put("name", "Android").put("version", Build.VERSION.RELEASE))
    .put("manufacturer", Build.MANUFACTURER)
    .put("model", Build.MODEL)
    .put("app", JSONObject()
      .put("version", BuildConfig.VERSION_NAME)
      .put("build", BuildConfig.VERSION_CODE.toString())))
  .put("console", JSONArray())
  .put("network", JSONArray())

val request = Request.Builder()
  .url("https://your-server/api/v1/ingest")
  .post(body.toString().toRequestBody("application/json".toMediaType()))
  .build()
OkHttpClient().newCall(request).execute().use { check(it.code == 201) }
```

### Flutter

```dart
final response = await http.post(
  Uri.parse('https://your-server/api/v1/ingest'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'projectKey': 'pk_…',
    'type': 'bug',
    'message': message,
    'pageUrl': currentRoute,
    'device': {
      'platform': Platform.operatingSystem, // "ios" | "android"
      'os': {'name': Platform.operatingSystem, 'version': Platform.operatingSystemVersion},
    },
    'console': [],
    'network': [],
  }),
);
```

For a screenshot in Flutter, wrap the app in a `RepaintBoundary`, call `boundary.toImage()` and encode the result as a PNG data URL.
