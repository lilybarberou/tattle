import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { AI_PROVIDERS } from "../../shared/ai";
import { organization, user } from "./auth";

const id = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at").defaultNow().notNull();

export const issueStatus = pgEnum("issue_status", [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"canceled",
	"duplicate",
]);
export const issueType = pgEnum("issue_type", ["bug", "feature"]);
export const actorType = pgEnum("actor_type", ["user", "agent", "system"]);

// A project receives reports from one app. The public key goes in the widget;
// allowed origins restrict which sites may use it.
export const project = pgTable(
	"project",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		publicKey: text("public_key").notNull().unique(),
		allowedOrigins: text("allowed_origins")
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		issueCounter: integer("issue_counter").notNull().default(0),
		// Public feature-request portal at /portal/<portalSlug>, off by default.
		portalEnabled: boolean("portal_enabled").notNull().default(false),
		portalSlug: text("portal_slug").unique(),
		// GitHub webhook at /api/v1/github/<id>: merged pull requests move their
		// linked issues to Done. Off by default; the secret signs deliveries.
		githubEnabled: boolean("github_enabled").notNull().default(false),
		githubSecret: text("github_secret"),
		githubLastDeliveryAt: timestamp("github_last_delivery_at"),
		githubLastDelivery: text("github_last_delivery"),
		// Identity verification, off while null: the app's backend signs its
		// user ids with this secret (HMAC-SHA256) so the widget can show a
		// person their reports on every device.
		identitySecret: text("identity_secret"),
		createdAt: createdAt(),
	},
	(t) => [uniqueIndex("project_org_slug_idx").on(t.organizationId, t.slug)],
);

// Bearer tokens for agents and scripts (REST API and MCP). Only the hash is stored.
export const apiToken = pgTable(
	"api_token",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		prefix: text("prefix").notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		canWrite: boolean("can_write").notNull().default(true),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		lastUsedAt: timestamp("last_used_at"),
		revokedAt: timestamp("revoked_at"),
		createdAt: createdAt(),
	},
	(t) => [index("api_token_org_idx").on(t.organizationId)],
);

export type Json =
	| string
	| number
	| boolean
	| null
	| Json[]
	| { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type DeviceInfo = JsonObject;
export type ConsoleEntry = {
	level: "log" | "info" | "warn" | "error" | "debug";
	message: string;
	timestamp: number;
	stack?: string;
};
export type NetworkEntry = {
	method: string;
	url: string;
	status: number;
	durationMs: number;
	timestamp: number;
	error?: string;
};
/**
 * One step of the trail an SDK records before a report: a navigation, a click,
 * a form field change, the app going to the background, or one the app added.
 */
export type Breadcrumb = {
	/** "navigation", "click", "input", "app", "custom" or the app's own. */
	category: string;
	message: string;
	timestamp: number;
	data?: { [key: string]: string | number | boolean | null };
};
export type Reporter = {
	id?: string;
	email?: string;
	name?: string;
	traits?: JsonObject;
};

/**
 * The words of an issue for full-text search: its title and description (a
 * widget issue's description is its first report's message). The 'simple'
 * configuration lowercases words without stemming, so it suits any language.
 */
export const issueSearchDocument = (t: {
	title: AnyPgColumn;
	description: AnyPgColumn;
}) => sql`to_tsvector('simple', ${t.title} || ' ' || ${t.description})`;

export const issue = pgTable(
	"issue",
	{
		id: id(),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		number: integer("number").notNull(),
		type: issueType("type").notNull().default("bug"),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		status: issueStatus("status").notNull().default("triage"),
		// 0 none, 1 urgent, 2 high, 3 medium, 4 low (same scale as Linear)
		priority: integer("priority").notNull().default(0),
		labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
		assigneeType: actorType("assignee_type"),
		assigneeId: text("assignee_id"),
		assigneeName: text("assignee_name"),
		duplicateOfId: text("duplicate_of_id"),
		prUrl: text("pr_url"),
		reportCount: integer("report_count").notNull().default(0),
		// Votes from the public portal; demand = reports + votes.
		voteCount: integer("vote_count").notNull().default(0),
		createdAt: createdAt(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("issue_project_number_idx").on(t.projectId, t.number),
		index("issue_project_status_idx").on(t.projectId, t.status),
		// Full-text search for duplicate candidates. Queries must use the same
		// expression (issueSearchDocument) for Postgres to use it.
		index("issue_search_idx").using("gin", issueSearchDocument(t)),
	],
);

// A raw submission from the widget. Several reports can point at one issue
// (duplicates, or many users asking for the same feature).
export const report = pgTable(
	"report",
	{
		id: id(),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		issueId: text("issue_id").references(() => issue.id, {
			onDelete: "set null",
		}),
		type: issueType("type").notNull(),
		message: text("message").notNull(),
		screenshotKey: text("screenshot_key"),
		pageUrl: text("page_url").notNull(),
		pageTitle: text("page_title"),
		reporter: jsonb("reporter").$type<Reporter>(),
		context: jsonb("context").$type<JsonObject>(),
		device: jsonb("device").$type<DeviceInfo>().notNull(),
		console: jsonb("console").$type<ConsoleEntry[]>().notNull(),
		network: jsonb("network").$type<NetworkEntry[]>().notNull(),
		breadcrumbs: jsonb("breadcrumbs")
			.$type<Breadcrumb[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		sdk: jsonb("sdk").$type<{ name: string; version: string }>(),
		// The version of the app that sent it, e.g. "1.4.2" or "1.4.2 (87)".
		release: text("release"),
		origin: text("origin"),
		// SHA-256 of the random key the widget keeps on the device: whoever
		// holds that key can follow this report and talk with the team.
		reporterKeyHash: text("reporter_key_hash"),
		// `reporter.id` when the app proved it with the identity verification
		// hash. Only then does the id give access, on any device.
		verifiedUserId: text("verified_user_id"),
		// The reporter's messages up to this time were emailed to the team (or
		// the team answered them): later ones are still to tell.
		teamNotifiedAt: timestamp("team_notified_at"),
		// The reporter used "Stop emails about this report": no more replies
		// or "shipped" notice by email. The widget still shows everything.
		emailsStoppedAt: timestamp("emails_stopped_at"),
		createdAt: createdAt(),
	},
	(t) => [
		index("report_project_idx").on(t.projectId, t.createdAt),
		index("report_issue_idx").on(t.issueId),
		index("report_project_release_idx").on(t.projectId, t.release),
		index("report_reporter_key_idx").on(t.projectId, t.reporterKeyHash),
		index("report_verified_user_idx").on(t.projectId, t.verifiedUserId),
	],
);

// The conversation between the team and the person who sent a report. Unlike
// comments, every message here is visible to the reporter.
export const reportMessage = pgTable(
	"report_message",
	{
		id: id(),
		reportId: text("report_id")
			.notNull()
			.references(() => report.id, { onDelete: "cascade" }),
		// user or agent: the team; reporter: the person who sent the report.
		authorType: text("author_type", {
			enum: ["user", "agent", "reporter"],
		}).notNull(),
		authorId: text("author_id"),
		authorName: text("author_name").notNull(),
		body: text("body").notNull(),
		// When the reporter read a team message; null while unread.
		readAt: timestamp("read_at"),
		createdAt: createdAt(),
	},
	(t) => [index("report_message_report_idx").on(t.reportId, t.createdAt)],
);

export const comment = pgTable(
	"comment",
	{
		id: id(),
		issueId: text("issue_id")
			.notNull()
			.references(() => issue.id, { onDelete: "cascade" }),
		authorType: actorType("author_type").notNull(),
		authorId: text("author_id"),
		authorName: text("author_name").notNull(),
		body: text("body").notNull(),
		createdAt: createdAt(),
	},
	(t) => [index("comment_issue_idx").on(t.issueId, t.createdAt)],
);

// Who changed what on an issue: shown as the issue timeline.
export const activity = pgTable(
	"activity",
	{
		id: id(),
		issueId: text("issue_id")
			.notNull()
			.references(() => issue.id, { onDelete: "cascade" }),
		actorType: actorType("actor_type").notNull(),
		actorId: text("actor_id"),
		actorName: text("actor_name").notNull(),
		action: text("action").notNull(),
		data: jsonb("data").$type<JsonObject>(),
		createdAt: createdAt(),
	},
	(t) => [index("activity_issue_idx").on(t.issueId, t.createdAt)],
);

// One vote per person per feature request on the public portal. A visitor is
// known by a random id kept in a cookie; the email is optional and only used
// to tell them when the feature ships.
export const issueVote = pgTable(
	"issue_vote",
	{
		id: id(),
		issueId: text("issue_id")
			.notNull()
			.references(() => issue.id, { onDelete: "cascade" }),
		voterKey: text("voter_key").notNull(),
		email: text("email"),
		createdAt: createdAt(),
	},
	(t) => [uniqueIndex("issue_vote_voter_idx").on(t.issueId, t.voterKey)],
);

// The workspace's own AI provider, used to judge duplicate candidates. The API
// key is encrypted with a key derived from BETTER_AUTH_SECRET (server/ai.ts)
// and never leaves the server; only its last 4 characters are shown.
export const aiSettings = pgTable("ai_settings", {
	organizationId: text("organization_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	provider: text("provider", { enum: AI_PROVIDERS }).notNull(),
	// Only for "openai_compatible", e.g. https://api.mistral.ai/v1.
	baseUrl: text("base_url"),
	model: text("model").notNull(),
	// Empty for an OpenAI-compatible server that needs no key (Ollama).
	apiKeyEncrypted: text("api_key_encrypted"),
	apiKeyLast4: text("api_key_last4"),
	enabled: boolean("enabled").notNull().default(false),
	// Calls the provider refused in a row (401, 402, 403, 429), the last
	// status, and when owners and admins were last told the key stopped working.
	refusedCalls: integer("refused_calls").notNull().default(0),
	lastRefusedStatus: integer("last_refused_status"),
	refusalNotifiedAt: timestamp("refusal_notified_at"),
	updatedById: text("updated_by_id").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: createdAt(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
});

// "This issue looks like that one", found by the workspace's AI or by matching
// words. Only a hint: nothing moves until someone merges. A dismissed pair is
// never suggested again for the same issue.
export const duplicateSuggestion = pgTable(
	"duplicate_suggestion",
	{
		id: id(),
		issueId: text("issue_id")
			.notNull()
			.references(() => issue.id, { onDelete: "cascade" }),
		suggestedIssueId: text("suggested_issue_id")
			.notNull()
			.references(() => issue.id, { onDelete: "cascade" }),
		source: text("source", { enum: ["ai", "text"] }).notNull(),
		reason: text("reason").notNull(),
		// How many words the two issues share, from 0 to 1.
		score: real("score"),
		dismissedAt: timestamp("dismissed_at"),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("duplicate_suggestion_pair_idx").on(
			t.issueId,
			t.suggestedIssueId,
		),
		index("duplicate_suggestion_suggested_idx").on(t.suggestedIssueId),
	],
);

export const webhookEndpoint = pgTable(
	"webhook_endpoint",
	{
		id: id(),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		// json: our signed payload; discord / slack: a readable chat message.
		format: text("format", { enum: ["json", "discord", "slack"] })
			.notNull()
			.default("json"),
		secret: text("secret").notNull(),
		// Empty array means every event.
		events: text("events").array().notNull().default(sql`'{}'::text[]`),
		active: boolean("active").notNull().default(true),
		// When owners and admins were told a delivery gave up after its retries;
		// cleared by the next successful delivery, so they hear once per outage.
		failureNotifiedAt: timestamp("failure_notified_at"),
		createdAt: createdAt(),
	},
	(t) => [index("webhook_project_idx").on(t.projectId)],
);

export const webhookDelivery = pgTable(
	"webhook_delivery",
	{
		id: id(),
		endpointId: text("endpoint_id")
			.notNull()
			.references(() => webhookEndpoint.id, { onDelete: "cascade" }),
		event: text("event").notNull(),
		payload: jsonb("payload").$type<JsonObject>().notNull(),
		status: text("status", { enum: ["pending", "success", "failed"] })
			.notNull()
			.default("pending"),
		attempts: integer("attempts").notNull().default(0),
		responseStatus: integer("response_status"),
		lastError: text("last_error"),
		createdAt: createdAt(),
		deliveredAt: timestamp("delivered_at"),
	},
	(t) => [index("delivery_endpoint_idx").on(t.endpointId, t.createdAt)],
);

// What each person wants by email (see shared/notifications.ts), and where
// their daily triage digest is. No row: the defaults.
export const notificationSetting = pgTable("notification_setting", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	reporterReplied: boolean("reporter_replied").notNull().default(true),
	assigned: boolean("assigned").notNull().default(true),
	regression: boolean("regression").notNull().default(true),
	// Null: on for owners and admins, off for members.
	triageDigest: boolean("triage_digest"),
	aiKeyFailing: boolean("ai_key_failing").notNull().default(true),
	webhookFailing: boolean("webhook_failing").notNull().default(true),
	// The UTC day ("2026-11-12") the digest was last prepared, and the time
	// it covered up to: the next one lists issues created after it.
	digestDay: text("digest_day"),
	digestCoveredUntil: timestamp("digest_covered_until"),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
});

export const projectRelations = relations(project, ({ one, many }) => ({
	organization: one(organization, {
		fields: [project.organizationId],
		references: [organization.id],
	}),
	issues: many(issue),
	reports: many(report),
	webhooks: many(webhookEndpoint),
}));

export const issueRelations = relations(issue, ({ one, many }) => ({
	project: one(project, {
		fields: [issue.projectId],
		references: [project.id],
	}),
	reports: many(report),
	votes: many(issueVote),
	comments: many(comment),
	activity: many(activity),
}));

export const reportRelations = relations(report, ({ one, many }) => ({
	project: one(project, {
		fields: [report.projectId],
		references: [project.id],
	}),
	issue: one(issue, { fields: [report.issueId], references: [issue.id] }),
	messages: many(reportMessage),
}));

export const reportMessageRelations = relations(reportMessage, ({ one }) => ({
	report: one(report, {
		fields: [reportMessage.reportId],
		references: [report.id],
	}),
}));

export const commentRelations = relations(comment, ({ one }) => ({
	issue: one(issue, { fields: [comment.issueId], references: [issue.id] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
	issue: one(issue, { fields: [activity.issueId], references: [issue.id] }),
}));

export const webhookEndpointRelations = relations(
	webhookEndpoint,
	({ one, many }) => ({
		project: one(project, {
			fields: [webhookEndpoint.projectId],
			references: [project.id],
		}),
		deliveries: many(webhookDelivery),
	}),
);

export const webhookDeliveryRelations = relations(
	webhookDelivery,
	({ one }) => ({
		endpoint: one(webhookEndpoint, {
			fields: [webhookDelivery.endpointId],
			references: [webhookEndpoint.id],
		}),
	}),
);

export const issueVoteRelations = relations(issueVote, ({ one }) => ({
	issue: one(issue, { fields: [issueVote.issueId], references: [issue.id] }),
}));
