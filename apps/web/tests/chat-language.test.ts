import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { project } from "#/db/schema";
import { describeEvent } from "#/server/chat-format";
import * as fns from "#/server/fns";
import { createWorkspace } from "./helpers/factories";
import { resetRequestContext, signInWith } from "./helpers/request-context";
import { setupTestDatabase } from "./helpers/runtime";
import { signedInMember } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());

describe("Discord and Slack", () => {
	const wokinu = { id: "p1", name: "Wokinu" };
	const data = {
		issue: { number: 4, title: "Export fails", type: "bug", status: "todo" },
		changes: { status: { from: "triage", to: "in_progress" } },
		actor: { name: "Ada", type: "user" },
	};

	it("are in English by default", () => {
		expect(describeEvent("issue.updated", wokinu, data)?.fields).toEqual([
			["Status", "Triage → In progress"],
			["By", "Ada"],
		]);
	});

	it("are in the project's chat language", async () => {
		expect(describeEvent("issue.updated", wokinu, data, "fr")?.fields).toEqual([
			["Statut", "Triage → En cours"],
			["Par", "Ada"],
		]);
		expect(describeEvent("ping", wokinu, null, "fr")?.title).toBe(
			"✅ Wokinu · Tattle est connecté",
		);
		const created = describeEvent(
			"report.created",
			wokinu,
			{
				issue: data.issue,
				report: {
					message: "It fails",
					pageUrl: "https://shop.example/cart",
					consoleErrors: 2,
					failedRequests: 1,
					hasScreenshot: true,
				},
			},
			"fr",
		);
		expect(created?.title).toBe("🐞 Wokinu #4 · Export fails");
		expect(created?.fields).toEqual([
			["Auteur", "Quelqu'un"],
			["Page", "https://shop.example/cart"],
			[
				"Indices",
				"2 erreurs de console · 1 requête en échec · capture d'écran jointe",
			],
		]);
	});

	it("follow the language saved in project settings", async () => {
		const { project: p, org } = await createWorkspace();
		signInWith((await signedInMember(org.id, "owner")).cookie);
		await fns.updateProjectFn({ data: { projectId: p.id, chatLocale: "fr" } });
		const [row] = await db
			.select({ chatLocale: project.chatLocale })
			.from(project)
			.where(eq(project.id, p.id));
		expect(row?.chatLocale).toBe("fr");
		expect(
			(await fns.getProjectFn({ data: { projectId: p.id } })).chatLocale,
		).toBe("fr");
	});
});
