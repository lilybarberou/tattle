import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { issue, report } from "#/db/schema";
import * as fns from "#/server/fns";
import { Ingest } from "#/server/Ingest";
import { HttpError } from "#/server/runtime";
import { createWorkspace, reportPayload } from "./helpers/factories";
import {
	resetRequestContext,
	signInWith,
	signOut,
} from "./helpers/request-context";
import { run, setupTestDatabase } from "./helpers/runtime";
import { type SignedIn, signedInMember } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());

const as = (person: SignedIn) => signInWith(person.cookie);

const statusOf = async (call: Promise<unknown>) => {
	try {
		await call;
		return 200;
	} catch (error) {
		if (error instanceof HttpError) return error.status;
		throw error;
	}
};

const submit = (projectKey: string, email = "reporter@example.com") =>
	run(
		Ingest.use((ingest) =>
			ingest.submit(
				reportPayload(projectKey, {
					reporter: { email, name: "Rita" },
					release: "1.4.2",
				}),
				null,
			),
		),
	);

describe("the session", () => {
	it("names the signed-in person, or nobody", async () => {
		const { org } = await createWorkspace();
		const me = await signedInMember(org.id, "member", {
			name: "Ada",
			email: "ada@example.com",
		});
		expect(await fns.getSessionFn()).toBeNull();
		as(me);
		expect(await fns.getSessionFn()).toEqual({
			user: { id: me.userId, name: "Ada", email: "ada@example.com" },
		});
	});
});

describe("issues and reports", () => {
	it("are read, commented, listed by release and overviewed by a member", async () => {
		const { org, project: p } = await createWorkspace();
		await submit(p.publicKey);
		as(await signedInMember(org.id));
		const detail = await fns.getIssueFn({
			data: { projectId: p.id, number: 1 },
		});
		expect(detail.issue.number).toBe(1);
		await fns.addCommentFn({
			data: { projectId: p.id, number: 1, body: "Looking" },
		});
		const after = await fns.getIssueFn({
			data: { projectId: p.id, number: 1 },
		});
		expect(JSON.stringify(after)).toContain("Looking");
		expect(await fns.listReleasesFn({ data: { projectId: p.id } })).toEqual([
			"1.4.2",
		]);
		expect(
			(await fns.listIssuesFn({ data: { projectId: p.id, release: "1.4.2" } }))
				.length,
		).toBe(1);
		const overview = await fns.getOverviewFn({ data: { projectId: p.id } });
		expect(overview).toEqual(expect.any(Object));
		const project = await fns.getProjectFn({ data: { projectId: p.id } });
		expect(project.counts).toEqual(expect.any(Object));
	});

	it("refuses an empty comment", async () => {
		const { org, project: p } = await createWorkspace();
		await submit(p.publicKey);
		as(await signedInMember(org.id));
		await expect(
			fns.addCommentFn({ data: { projectId: p.id, number: 1, body: "" } }),
		).rejects.toThrow();
	});

	it("can be deleted by an admin, within their own project only", async () => {
		const { org, project: mine } = await createWorkspace();
		const { project: theirs } = await createWorkspace();
		await submit(mine.publicKey);
		const theirReport = await submit(theirs.publicKey);
		as(await signedInMember(org.id, "admin"));

		expect(
			await statusOf(
				fns.deleteReportFn({
					data: { projectId: mine.id, reportId: theirReport.id },
				}),
			),
		).toBe(404);
		expect(await db.select().from(report)).toHaveLength(2);

		const [own] = (await db.select().from(report)).filter(
			(r) => r.projectId === mine.id,
		);
		await fns.deleteReportFn({
			data: { projectId: mine.id, reportId: own?.id as string },
		});
		expect(await db.select().from(report)).toHaveLength(1);

		expect(
			await statusOf(
				fns.deleteIssueFn({ data: { projectId: mine.id, number: 99 } }),
			),
		).toBe(404);
		await fns.deleteIssueFn({ data: { projectId: mine.id, number: 1 } });
		const left = await db.select().from(issue);
		expect(left.map((i) => i.projectId)).toEqual([theirs.id]);
	});
});

describe("duplicate suggestions", () => {
	it("are looked for and dismissed by a member", async () => {
		const { org, project: p } = await createWorkspace();
		await submit(p.publicKey);
		as(await signedInMember(org.id));
		expect(
			await fns.findDuplicatesFn({ data: { projectId: p.id, number: 1 } }),
		).toBeDefined();
		await fns.dismissDuplicateFn({ data: { projectId: p.id, number: 1 } });
	});
});

describe("workspace AI settings", () => {
	it("are seen by members and changed by admins only, without ever returning the key", async () => {
		const { org } = await createWorkspace();
		const admin = await signedInMember(org.id, "admin");
		const plain = await signedInMember(org.id, "member");
		const input = {
			organizationId: org.id,
			provider: "openai" as const,
			model: "gpt-test",
			apiKey: "sk-test-secret-key",
		};
		as(plain);
		expect(
			await statusOf(
				fns.saveAiSettingsFn({ data: { ...input, enabled: true } }),
			),
		).toBe(403);
		expect(await statusOf(fns.testAiSettingsFn({ data: input }))).toBe(403);
		expect(
			await statusOf(
				fns.removeAiSettingsFn({ data: { organizationId: org.id } }),
			),
		).toBe(403);

		as(admin);
		const saved = await fns.saveAiSettingsFn({
			data: { ...input, enabled: false },
		});
		expect(JSON.stringify(saved)).not.toContain("sk-test-secret-key");
		as(plain);
		const seen = await fns.getAiSettingsFn({
			data: { organizationId: org.id },
		});
		expect(JSON.stringify(seen)).not.toContain("sk-test-secret-key");
		as(admin);
		await fns.removeAiSettingsFn({ data: { organizationId: org.id } });
	});
});

describe("personal data", () => {
	it("is found by members, exported and erased by admins", async () => {
		const { org, project: p } = await createWorkspace();
		await submit(p.publicKey, "rita@example.com");
		const admin = await signedInMember(org.id, "admin");
		const plain = await signedInMember(org.id);
		const query = { organizationId: org.id, query: "rita@example.com" };

		as(plain);
		// Members see what exists, not the content.
		expect(await fns.findReporterFn({ data: query })).toEqual({
			reports: 1,
			votes: 0,
			projects: ["Web app"],
		});
		await expect(
			fns.findReporterFn({ data: { organizationId: org.id, query: "  " } }),
		).rejects.toThrow();

		as(admin);
		const exported = JSON.parse(await fns.exportReporterFn({ data: query }));
		expect(JSON.stringify(exported)).toContain("Checkout button does nothing");
		const erased = await fns.eraseReporterFn({ data: query });
		expect(erased).toMatchObject({ reports: 1 });
		signOut();
		expect(await statusOf(fns.eraseReporterFn({ data: query }))).toBe(401);
	});
});
