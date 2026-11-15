import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { project, report } from "#/db/schema";
import { Route as wellKnownRoute } from "#/routes/[.]well-known/$";
import { Route as authRoute } from "#/routes/api/auth/$";
import { Route as mcpRoute } from "#/routes/api/mcp";
import { Route as filesRoute } from "#/routes/api/v1/files";
import { Route as githubRoute } from "#/routes/api/v1/github.$projectId";
import { Route as ingestRoute } from "#/routes/api/v1/ingest";
import { Route as unsubscribeRoute } from "#/routes/api/v1/unsubscribe.$token";
import { Route as healthRoute } from "#/routes/health";
import { signGithub } from "#/server/GitHub";
import { CLIENT_IP_HEADER, withClientIp } from "#/server/rate-limit";
import { Storage } from "#/server/Storage";
import { signUnsubscribe } from "#/server/unsubscribe";
import { createWorkspace, reportPayload } from "./helpers/factories";
import { requestContext, resetRequestContext } from "./helpers/request-context";
import { run, setupTestDatabase } from "./helpers/runtime";
import { signedInMember } from "./helpers/session";

vi.mock("@tanstack/react-router", () => import("./helpers/router-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());
afterEach(() => vi.unstubAllEnvs());

type Handlers = Record<
	string,
	(ctx: { request: Request; params: Record<string, string> }) => unknown
>;
const handlers = (route: unknown) =>
	(route as { server: { handlers: Handlers } }).server.handlers;
const call = async (
	route: unknown,
	method: string,
	request: Request,
	params: Record<string, string> = {},
) => {
	const handler = handlers(route)[method];
	if (!handler) throw new Error(`No ${method} handler`);
	return (await handler({ request, params })) as Response;
};

const ORIGIN = "https://shop.example.com";
const ingest = (body: BodyInit, headers: Record<string, string> = {}) =>
	call(
		ingestRoute,
		"POST",
		new Request("http://localhost:3000/api/v1/ingest", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: ORIGIN,
				...headers,
			},
			body,
			duplex: "half",
		} as RequestInit),
	);

describe("POST /api/v1/ingest", () => {
	it("answers the preflight of any origin", async () => {
		const response = await call(
			ingestRoute,
			"OPTIONS",
			new Request("http://localhost:3000/api/v1/ingest", {
				method: "OPTIONS",
				headers: { origin: ORIGIN },
			}),
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
		expect(response.headers.get("access-control-allow-methods")).toBe(
			"POST, OPTIONS",
		);
		expect(response.headers.get("vary")).toBe("origin");
	});

	it("creates a report from an allowed origin", async () => {
		const { project: p } = await createWorkspace({ allowedOrigins: [ORIGIN] });
		const response = await ingest(JSON.stringify(reportPayload(p.publicKey)));
		expect(response.status).toBe(201);
		expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
		expect(await db.select().from(report)).toHaveLength(1);
	});

	it("refuses a report from another site", async () => {
		const { project: p } = await createWorkspace({
			allowedOrigins: ["https://other.example.com"],
		});
		const response = await ingest(JSON.stringify(reportPayload(p.publicKey)));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "This origin is not allowed for this project",
		});
		expect(await db.select().from(report)).toEqual([]);
	});

	it("answers 400 to a body that is not JSON, and 413 to a huge one", async () => {
		expect((await ingest("{not json")).status).toBe(400);
		const declared = await ingest("{}", {
			"content-length": String(13 * 1024 * 1024),
		});
		expect(declared.status).toBe(413);
		const huge = await ingest(
			new ReadableStream({
				start(controller) {
					const chunk = new Uint8Array(1024 * 1024).fill(32);
					for (let i = 0; i < 13; i++) controller.enqueue(chunk);
					controller.close();
				},
			}),
		);
		expect(huge.status).toBe(413);
		expect(await huge.json()).toEqual({ error: "Report is too large" });
	});

	it("limits each IP to 20 requests per 10 minutes, valid or not", async () => {
		for (let i = 0; i < 20; i++) {
			expect((await ingest("not json")).status).toBe(400);
		}
		const limited = await ingest("not json");
		expect(limited.status).toBe(429);
		expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
		expect(limited.headers.get("access-control-allow-origin")).toBe(ORIGIN);
	});

	it("puts every malformed key in one shared window", async () => {
		vi.stubEnv("INGEST_LIMIT_PER_PROJECT", "2");
		vi.stubEnv("INGEST_LIMIT_PER_IP", "1000");
		for (const projectKey of ["pk_short", "x".repeat(5000)]) {
			const response = await ingest(JSON.stringify({ projectKey }));
			expect(response.status).not.toBe(429);
		}
		const third = await ingest(JSON.stringify({ projectKey: 42 }));
		expect(third.status).toBe(429);
		// A well-formed key has its own window.
		const { project: p } = await createWorkspace({ allowedOrigins: [ORIGIN] });
		const valid = await ingest(JSON.stringify(reportPayload(p.publicKey)));
		expect(valid.status).toBe(201);
	});
});

describe("GET /api/v1/files", () => {
	const signedUrl = (key: string, ttl: number) =>
		run(Storage.use((s) => Effect.succeed(s.signedUrl(key, ttl))));
	const serve = (url: string) =>
		call(filesRoute, "GET", new Request(url, { method: "GET" }));
	const stored = async (key: string) => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		await run(Storage.use((s) => s.put(key, png)));
		return signedUrl(key, 60);
	};

	it("serves a file through its signed URL, without sniffing", async () => {
		const url = await stored("p1/r1/screenshot.png");
		const response = await serve(url);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
		);
	});

	it("refuses a changed key, expiry or signature", async () => {
		const url = new URL(await stored("p1/r1/screenshot.png"));
		await stored("p1/r2/screenshot.png");
		const changed = (name: string, value: string) => {
			const copy = new URL(url);
			copy.searchParams.set(name, value);
			return copy.toString();
		};
		expect((await serve(changed("key", "p1/r2/screenshot.png"))).status).toBe(
			404,
		);
		const exp = Number(url.searchParams.get("exp"));
		expect((await serve(changed("exp", String(exp + 1)))).status).toBe(404);
		expect((await serve(changed("sig", "AAAA"))).status).toBe(404);
		const bare = new URL(url);
		bare.search = "";
		expect((await serve(bare.toString())).status).toBe(404);
	});

	it("refuses an expired URL", async () => {
		await stored("p1/r1/screenshot.png");
		const url = await signedUrl("p1/r1/screenshot.png", -10);
		expect((await serve(url)).status).toBe(404);
	});

	it("never reads outside the storage folder, even with a signed key", async () => {
		const url = await signedUrl("../../../../etc/hosts", 60);
		expect((await serve(url)).status).toBe(404);
	});

	it("serves unknown extensions as bytes", async () => {
		const url = await stored("p1/r1/data.html");
		const response = await serve(url);
		expect(response.headers.get("content-type")).toBe(
			"application/octet-stream",
		);
	});
});

describe("POST /api/v1/github/:projectId", () => {
	const deliver = (
		projectId: string,
		body: string,
		headers: Record<string, string>,
	) =>
		call(
			githubRoute,
			"POST",
			new Request(`http://localhost:3000/api/v1/github/${projectId}`, {
				method: "POST",
				headers,
				body,
			}),
			{ projectId },
		);

	const withSecret = async () => {
		const { project: p } = await createWorkspace();
		await db
			.update(project)
			.set({ githubEnabled: true, githubSecret: "gh-secret" })
			.where(eq(project.id, p.id));
		return p;
	};

	it("answers a signed ping, and 401 to a bad or missing signature", async () => {
		const p = await withSecret();
		const body = JSON.stringify({ zen: "Keep it simple" });
		const signature = signGithub("gh-secret", new TextEncoder().encode(body));
		const ok = await deliver(p.id, body, {
			"x-github-event": "ping",
			"x-hub-signature-256": signature,
		});
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ ok: true, message: "Ping received" });

		const bad = await deliver(p.id, body, {
			"x-github-event": "ping",
			"x-hub-signature-256": signGithub(
				"other",
				new TextEncoder().encode(body),
			),
		});
		expect(bad.status).toBe(401);
		const none = await deliver(p.id, body, { "x-github-event": "ping" });
		expect(none.status).toBe(401);
		const unknown = await deliver("no-such-project", body, {
			"x-github-event": "ping",
			"x-hub-signature-256": signature,
		});
		expect(unknown.status).toBe(401);
	});

	it("answers 413 above 2 MB without reading it", async () => {
		const p = await withSecret();
		const response = await deliver(p.id, "{}", {
			"content-length": String(3 * 1024 * 1024),
		});
		expect(response.status).toBe(413);
	});

	it("limits deliveries per IP and project", async () => {
		vi.stubEnv("GITHUB_LIMIT_PER_IP", "3");
		const p = await withSecret();
		for (let i = 0; i < 3; i++) {
			expect((await deliver(p.id, "{}", {})).status).toBe(401);
		}
		const limited = await deliver(p.id, "{}", {});
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
		// Changing the project id in the URL does not escape the limit for long.
		for (let i = 0; i < 9; i++) await deliver(`other-${i}`, "{}", {});
		expect((await deliver("other-new", "{}", {})).status).toBe(429);
	});
});

describe("/api/v1/unsubscribe/:token", () => {
	it("applies a one-click POST and refuses unknown tokens", async () => {
		const { org } = await createWorkspace();
		const person = await signedInMember(org.id);
		const token = signUnsubscribe({
			kind: "team",
			userId: person.userId,
			type: "triage_digest",
		});
		const post = (t: string) =>
			call(
				unsubscribeRoute,
				"POST",
				new Request(`http://localhost:3000/api/v1/unsubscribe/${t}`, {
					method: "POST",
					body: "List-Unsubscribe=One-Click",
				}),
				{ token: t },
			);
		expect((await post(token)).status).toBe(200);
		expect((await post(`${token}x`)).status).toBe(404);
		expect((await post("garbage")).status).toBe(404);
	});

	it("sends a browser to the confirmation page", async () => {
		const response = await call(
			unsubscribeRoute,
			"GET",
			new Request("http://localhost:3000/api/v1/unsubscribe/abc"),
			{ token: "abc" },
		);
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("/unsubscribe/abc");
	});
});

describe("/.well-known", () => {
	const get = (splat: string) =>
		call(
			wellKnownRoute,
			"GET",
			new Request(`http://localhost:3000/.well-known/${splat}`),
			{ _splat: splat },
		);

	it("forwards the OAuth discovery documents, readable from any origin", async () => {
		const response = await get("oauth-authorization-server");
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		const document = (await response.json()) as { issuer?: string };
		expect(document.issuer).toEqual(expect.any(String));
		const resource = await get("oauth-protected-resource/api/mcp");
		expect(resource.status).toBeLessThan(500);
	});

	it("knows no other document", async () => {
		expect((await get("security.txt")).status).toBe(404);
		expect((await get("openid-configuration-evil")).status).toBe(404);
	});

	it("answers its preflight", async () => {
		const response = await call(
			wellKnownRoute,
			"OPTIONS",
			new Request("http://localhost:3000/.well-known/x", { method: "OPTIONS" }),
		);
		expect(response.status).toBe(204);
	});
});

describe("/api/auth", () => {
	it("hands Better Auth the IP worked out by the server, never the client's", async () => {
		requestContext.ip = "192.0.2.10";
		const forwarded = withClientIp(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: { [CLIENT_IP_HEADER]: "192.0.2.66", "x-other": "kept" },
				body: JSON.stringify({ a: 1 }),
				duplex: "half",
			} as RequestInit),
		);
		expect(forwarded.headers.get(CLIENT_IP_HEADER)).toBe("192.0.2.10");
		expect(forwarded.headers.get("x-other")).toBe("kept");
		expect(await forwarded.json()).toEqual({ a: 1 });
	});

	it("passes sign-in through with its body", async () => {
		const { org } = await createWorkspace();
		const person = await signedInMember(org.id);
		const response = await call(
			authRoute,
			"POST",
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: person.email,
					password: "a-long-enough-password",
				}),
				duplex: "half",
			} as RequestInit),
		);
		expect(response.status).toBe(200);
		const wrong = await call(
			authRoute,
			"POST",
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: person.email,
					password: "nope-nope-nope",
				}),
				duplex: "half",
			} as RequestInit),
		);
		expect(wrong.status).toBe(401);
	});
	// Better Auth turns its own origin (CSRF) check off when NODE_ENV=test,
	// so a sign-in posted from another site cannot be tested here.
});

describe("small routes", () => {
	it("/health checks the database and gives the version", async () => {
		const response = await call(
			healthRoute,
			"GET",
			new Request("http://localhost:3000/health"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, version: "dev" });
	});

	it("/api/mcp takes POST only", async () => {
		const response = await call(
			mcpRoute,
			"GET",
			new Request("http://localhost:3000/api/mcp"),
		);
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});
});
