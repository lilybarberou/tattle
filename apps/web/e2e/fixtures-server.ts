/**
 * The outside world, played on this machine (started by Playwright):
 *
 * - GET  /site?key=pk_…        the customer's website: a page that embeds the
 *                              widget from the app, with buttons that log to
 *                              the console and make network requests. With
 *                              &csp=strict, it sends the Content-Security-Policy
 *                              the widget's README documents.
 * - GET  /api/ok, /api/broken  the website's own API (200 and 500).
 * - POST /hooks/<box>          a webhook receiver: records each delivery.
 * - GET  /hooks/<box>          the deliveries recorded in that box, as JSON.
 *
 * Boxes are named by the tests, so parallel tests never read each other's
 * deliveries.
 */
import { createServer } from "node:http";
import { APP_URL, assertEverythingLocal, FIXTURES_PORT } from "./config.ts";

assertEverythingLocal();

type Delivery = {
	headers: Record<string, string | string[] | undefined>;
	body: string;
	receivedAt: string;
};
const boxes = new Map<string, Delivery[]>();

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] ?? c,
	);

/** The site's own inline scripts carry it under &csp=strict. */
const SITE_NONCE = "e2e-site-nonce";

/**
 * A strict policy plus what packages/widget/README.md says the widget needs:
 * its script and API on the Tattle server, inline styles for its Shadow
 * DOM, and data:/blob: images for the screenshot.
 */
const strictCsp = [
	"default-src 'self'",
	`script-src 'self' 'nonce-${SITE_NONCE}' ${APP_URL}`,
	`connect-src 'self' ${APP_URL}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
].join("; ");

const sitePage = (params: URLSearchParams) => {
	const nonce = params.get("csp") === "strict" ? ` nonce="${SITE_NONCE}"` : "";
	const key = params.get("key") ?? "";
	const release = params.get("release") ?? "1.4.2";
	const email = params.get("email");
	const name = params.get("name");
	const identify =
		email || name
			? `<script${nonce}>window.Tattle = window.Tattle || { q: [] };
Tattle.identify = Tattle.identify || function () { Tattle.q.push(["identify"].concat([].slice.call(arguments))); };
Tattle.identify(${JSON.stringify({ id: email ?? name, email: email ?? undefined, name: name ?? undefined })});</script>`
			: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme Shop</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#1f2937}main{max-width:40rem}</style>
</head>
<body>
<main>
<h1>Acme Shop</h1>
<p>Checkout: the customer's own app, which embeds the Tattle widget.</p>
<label for="coupon">Coupon</label>
<input id="coupon" name="coupon">
<button type="button" id="load">Load cart</button>
<button type="button" id="pay">Pay now</button>
<p id="status" role="status"></p>
</main>
${identify}
<script${nonce}>
document.getElementById("load").addEventListener("click", async () => {
  const response = await fetch("/api/ok");
  console.log("cart loaded", (await response.json()).items);
  document.getElementById("status").textContent = "Cart loaded";
});
document.getElementById("pay").addEventListener("click", async () => {
  const response = await fetch("/api/broken", { method: "POST" });
  console.error("Payment failed with status " + response.status);
  document.getElementById("status").textContent = "Payment failed";
});
</script>
<script src="${APP_URL}/widget.js" data-project-key="${escapeHtml(key)}" data-api-url="${APP_URL}" data-locale="en" data-release="${escapeHtml(release)}" defer></script>
</body>
</html>`;
};

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", "http://fixtures.local");
	const chunks: Buffer[] = [];
	req.on("data", (chunk: Buffer) => chunks.push(chunk));
	req.on("end", () => {
		const body = Buffer.concat(chunks).toString("utf8");
		const hook = url.pathname.match(/^\/hooks\/([\w-]+)$/);
		if (hook) {
			const box = hook[1] as string;
			if (req.method === "POST") {
				const list = boxes.get(box) ?? [];
				list.push({
					headers: req.headers,
					body,
					receivedAt: new Date().toISOString(),
				});
				boxes.set(box, list);
				res.writeHead(200, { "content-type": "text/plain" }).end("ok");
				return;
			}
			res
				.writeHead(200, { "content-type": "application/json" })
				.end(JSON.stringify(boxes.get(box) ?? []));
			return;
		}
		if (url.pathname === "/site") {
			res
				.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					...(url.searchParams.get("csp") === "strict"
						? { "content-security-policy": strictCsp }
						: {}),
				})
				.end(sitePage(url.searchParams));
			return;
		}
		if (url.pathname === "/api/ok") {
			res
				.writeHead(200, { "content-type": "application/json" })
				.end(JSON.stringify({ items: 3 }));
			return;
		}
		if (url.pathname === "/api/broken") {
			res
				.writeHead(500, { "content-type": "application/json" })
				.end(JSON.stringify({ error: "card declined" }));
			return;
		}
		if (url.pathname === "/health") {
			res.writeHead(200).end("ok");
			return;
		}
		res.writeHead(404).end("not found");
	});
});

server.listen(FIXTURES_PORT, "127.0.0.1", () => {
	console.log(`[fixtures] listening on 127.0.0.1:${FIXTURES_PORT}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.on(signal, () => server.close(() => process.exit(0)));
