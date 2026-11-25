import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as ingestRoute } from "#/routes/api/v1/ingest";
import { errorText } from "#/server/errors";
import * as fns from "#/server/fns";
import { createWorkspace, reportPayload } from "./helpers/factories";
import {
	requestContext,
	resetRequestContext,
	signInWith,
} from "./helpers/request-context";
import { setupTestDatabase } from "./helpers/runtime";
import { signedInMember } from "./helpers/session";

vi.mock("@tanstack/react-router", () => import("./helpers/router-mock"));
vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());

const failure = async (call: Promise<unknown>) => {
	try {
		await call;
	} catch (error) {
		return error as { status: number; message: string };
	}
	throw new Error("Expected the call to fail");
};

describe("errors on public pages", () => {
	it("are in the visitor's language", async () => {
		requestContext.headers.set("accept-language", "fr-FR,fr;q=0.9");
		expect(
			await failure(fns.getPortalFn({ data: { slug: "nowhere" } })),
		).toMatchObject({ status: 404, message: "Cette page n'existe pas" });
	});

	it("are in English otherwise", async () => {
		requestContext.headers.set("accept-language", "de-DE");
		expect(
			await failure(fns.getPortalFn({ data: { slug: "nowhere" } })),
		).toMatchObject({ status: 404, message: "This page does not exist" });
	});
});

describe("errors in the dashboard", () => {
	it("are in the person's chosen language, with their values", async () => {
		const { org, project } = await createWorkspace();
		const person = await signedInMember(org.id);
		signInWith(person.cookie);
		requestContext.headers.set("accept-language", "en-US");
		await fns.setLocalePreferenceFn({ data: { preference: "fr" } });

		expect(
			await failure(
				fns.getIssueFn({ data: { projectId: project.id, number: 999 } }),
			),
		).toMatchObject({ status: 404, message: "Ticket #999 introuvable" });

		await fns.setLocalePreferenceFn({ data: { preference: "auto" } });
		expect(
			await failure(
				fns.getIssueFn({ data: { projectId: project.id, number: 999 } }),
			),
		).toMatchObject({ status: 404, message: "Issue #999 not found" });
	});

	it("format numbers in the reader's language", () => {
		expect(errorText("en", "commentTooLong", { max: 20_000 })).toBe(
			"A comment takes at most 20,000 characters",
		);
		expect(errorText("fr", "commentTooLong", { max: 20_000 })).toBe(
			"Un commentaire compte au plus 20 000 caractères",
		);
	});
});

describe("errors of the REST API", () => {
	it("stay in English, whatever the browser asks for", async () => {
		const { project } = await createWorkspace({
			allowedOrigins: ["https://other.example.com"],
		});
		const handler = (
			ingestRoute as unknown as {
				server: {
					handlers: Record<
						string,
						(ctx: { request: Request; params: object }) => Promise<Response>
					>;
				};
			}
		).server.handlers.POST;
		if (!handler) throw new Error("No POST handler");
		const response = await handler({
			request: new Request("http://localhost:3000/api/v1/ingest", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://shop.example.com",
					"accept-language": "fr-FR,fr;q=0.9",
				},
				body: JSON.stringify(reportPayload(project.publicKey)),
			}),
			params: {},
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "This origin is not allowed for this project",
		});
	});
});
