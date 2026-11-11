import { randomUUID } from "node:crypto";
import { db } from "#/db";
import {
	apiToken,
	member,
	organization,
	project,
	user,
	webhookEndpoint,
} from "#/db/schema";
import { type Actor, generatePublicKey, generateToken } from "#/server/Access";
import type { IngestPayload } from "#/server/Ingest";

let sequence = 0;
const unique = (prefix: string) =>
	`${prefix}-${++sequence}-${randomUUID().slice(0, 8)}`;

const first = <T>(rows: T[]): T => {
	const [row] = rows;
	if (row === undefined) throw new Error("Insert returned no row");
	return row;
};

/** A 1×1 transparent PNG. */
export const PNG_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const userActor: Actor = { type: "user", id: "user-1", name: "Ada" };
export const agentActor: Actor = { type: "agent", id: "token-1", name: "Bot" };

export const createOrganization = async (name = "Acme") =>
	first(
		await db
			.insert(organization)
			.values({
				id: randomUUID(),
				name,
				slug: unique("org"),
				createdAt: new Date(),
			})
			.returning(),
	);

export const createUser = async (
	input: { name?: string; email?: string } = {},
) =>
	first(
		await db
			.insert(user)
			.values({
				id: randomUUID(),
				name: input.name ?? "Ada Lovelace",
				email: input.email ?? `${unique("user")}@example.com`,
			})
			.returning(),
	);

export const addMember = async (organizationId: string, userId: string) =>
	first(
		await db
			.insert(member)
			.values({
				id: randomUUID(),
				organizationId,
				userId,
				role: "owner",
				createdAt: new Date(),
			})
			.returning(),
	);

export const createProject = async (
	organizationId: string,
	options: {
		name?: string;
		allowedOrigins?: string[];
		portalEnabled?: boolean;
		portalSlug?: string;
	} = {},
) =>
	first(
		await db
			.insert(project)
			.values({
				organizationId,
				name: options.name ?? "Web app",
				slug: unique("project"),
				publicKey: generatePublicKey(),
				allowedOrigins: options.allowedOrigins ?? [],
				portalEnabled: options.portalEnabled ?? false,
				portalSlug: options.portalSlug ?? null,
			})
			.returning(),
	);

/** An organization with one project, ready to receive reports. */
export const createWorkspace = async (
	options: Parameters<typeof createProject>[1] = {},
) => {
	const org = await createOrganization();
	const proj = await createProject(org.id, options);
	return { org, project: proj };
};

export const createApiToken = async (
	organizationId: string,
	options: { canWrite?: boolean; revoked?: boolean; name?: string } = {},
) => {
	const { token, prefix, hash } = generateToken();
	const row = first(
		await db
			.insert(apiToken)
			.values({
				organizationId,
				name: options.name ?? "Triage agent",
				prefix,
				tokenHash: hash,
				canWrite: options.canWrite ?? true,
				revokedAt: options.revoked ? new Date() : null,
			})
			.returning(),
	);
	return { token, row };
};

export const createWebhookEndpoint = async (
	projectId: string,
	url: string,
	options: {
		format?: "json" | "discord" | "slack";
		events?: string[];
		secret?: string;
	} = {},
) =>
	first(
		await db
			.insert(webhookEndpoint)
			.values({
				projectId,
				url,
				format: options.format ?? "json",
				events: options.events ?? [],
				secret: options.secret ?? "whsec_test",
			})
			.returning(),
	);

/** A valid widget payload; override any field. */
export const reportPayload = (
	projectKey: string,
	overrides: Partial<IngestPayload> = {},
): IngestPayload => ({
	projectKey,
	type: "bug",
	message: "Checkout button does nothing\nI clicked it three times.",
	pageUrl: "https://shop.example.com/checkout",
	pageTitle: "Checkout",
	device: {
		browser: { name: "Firefox", version: "130" },
		os: { name: "macOS", version: "14.5" },
	},
	console: [],
	network: [],
	...overrides,
});
