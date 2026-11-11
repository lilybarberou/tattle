import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import {
	apiToken,
	member,
	oauthClient,
	oauthConsent,
	project,
	user,
} from "#/db/schema";
import { auth } from "#/lib/auth";
import { Database } from "./Database";
import { DbError, Forbidden, NotFound, Unauthorized } from "./errors";

export const TOKEN_PREFIX = "tat_";

export type Principal =
	| {
			readonly kind: "user";
			readonly userId: string;
			readonly name: string;
			readonly organizationIds: ReadonlyArray<string>;
	  }
	| {
			readonly kind: "token";
			readonly tokenId: string;
			readonly name: string;
			readonly organizationIds: ReadonlyArray<string>;
			readonly canWrite: boolean;
	  };

/** Who performed an action, as recorded on issues, comments and activity. */
export type Actor = {
	readonly type: "user" | "agent" | "system";
	readonly id: string | null;
	readonly name: string;
};

export const actorOf = (principal: Principal): Actor =>
	principal.kind === "user"
		? { type: "user", id: principal.userId, name: principal.name }
		: { type: "agent", id: principal.tokenId, name: principal.name };

export const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

export const generateToken = () => {
	const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
	return { token, prefix: token.slice(0, 12), hash: hashToken(token) };
};

export const generatePublicKey = () => `pk_${randomBytes(16).toString("hex")}`;

type ProjectRow = typeof project.$inferSelect;

export class Access extends Context.Service<
	Access,
	{
		/** Resolves a Bearer API token or the session cookie. */
		readonly fromHeaders: (
			headers: Headers,
		) => Effect.Effect<Principal, Unauthorized | DbError>;
		readonly fromToken: (
			token: string,
		) => Effect.Effect<Principal, Unauthorized | DbError>;
		/** A signed-in person, e.g. from the subject of an OAuth access token. */
		readonly fromUserId: (
			userId: string,
		) => Effect.Effect<Principal, Unauthorized | DbError>;
		/**
		 * The person behind an OAuth access token, as long as they still allow
		 * that app: disconnecting it in Agents & API takes effect at once.
		 */
		readonly fromOAuth: (
			userId: string,
			clientId: string,
		) => Effect.Effect<Principal, Unauthorized | DbError>;
		readonly requireProject: (
			principal: Principal,
			projectId: string,
		) => Effect.Effect<ProjectRow, NotFound | DbError>;
		readonly requireWrite: (
			principal: Principal,
		) => Effect.Effect<void, Forbidden>;
		readonly requireOrganization: (
			principal: Principal,
			organizationId: string,
		) => Effect.Effect<void, Forbidden>;
	}
>()("tattle/server/Access") {
	static readonly layer = Layer.effect(
		Access,
		Effect.gen(function* () {
			const database = yield* Database;

			const fromToken = Effect.fn("Access.fromToken")(function* (
				token: string,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select()
						.from(apiToken)
						.where(
							and(
								eq(apiToken.tokenHash, hashToken(token)),
								isNull(apiToken.revokedAt),
							),
						),
				);
				if (!row)
					return yield* new Unauthorized({ message: "Invalid API token" });
				yield* database
					.query((db) =>
						db
							.update(apiToken)
							.set({ lastUsedAt: new Date() })
							.where(eq(apiToken.id, row.id)),
					)
					.pipe(Effect.ignore);
				return {
					kind: "token",
					tokenId: row.id,
					name: row.name,
					organizationIds: [row.organizationId],
					canWrite: row.canWrite,
				} satisfies Principal;
			});

			const fromUserId = Effect.fn("Access.fromUserId")(function* (
				userId: string,
			) {
				const [row] = yield* database.query((db) =>
					db
						.select({ id: user.id, name: user.name })
						.from(user)
						.where(eq(user.id, userId)),
				);
				if (!row) return yield* new Unauthorized({ message: "Unknown user" });
				const memberships = yield* database.query((db) =>
					db
						.select({ organizationId: member.organizationId })
						.from(member)
						.where(eq(member.userId, row.id)),
				);
				return {
					kind: "user",
					userId: row.id,
					name: row.name,
					organizationIds: memberships.map((m) => m.organizationId),
				} satisfies Principal;
			});

			const fromOAuth = Effect.fn("Access.fromOAuth")(function* (
				userId: string,
				clientId: string,
			) {
				const [consent] = yield* database.query((db) =>
					db
						.select({ id: oauthConsent.id })
						.from(oauthConsent)
						.innerJoin(
							oauthClient,
							eq(oauthClient.clientId, oauthConsent.clientId),
						)
						.where(
							and(
								eq(oauthConsent.userId, userId),
								eq(oauthConsent.clientId, clientId),
								sql`coalesce(${oauthClient.disabled}, false) = false`,
							),
						),
				);
				if (!consent) {
					return yield* new Unauthorized({
						message: "This app was disconnected",
					});
				}
				return yield* fromUserId(userId);
			});

			const fromHeaders = Effect.fn("Access.fromHeaders")(function* (
				headers: Headers,
			) {
				const authorization = headers.get("authorization");
				const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
				if (bearer?.startsWith(TOKEN_PREFIX)) return yield* fromToken(bearer);

				const session = yield* Effect.tryPromise({
					try: () => auth.api.getSession({ headers }),
					catch: (cause) => new DbError({ cause }),
				});
				if (!session)
					return yield* new Unauthorized({ message: "Not signed in" });

				const memberships = yield* database.query((db) =>
					db
						.select({ organizationId: member.organizationId })
						.from(member)
						.where(eq(member.userId, session.user.id)),
				);
				return {
					kind: "user",
					userId: session.user.id,
					name: session.user.name,
					organizationIds: memberships.map((m) => m.organizationId),
				} satisfies Principal;
			});

			const requireProject = Effect.fn("Access.requireProject")(function* (
				principal: Principal,
				projectId: string,
			) {
				if (principal.organizationIds.length === 0) {
					return yield* new NotFound({ message: "Project not found" });
				}
				const [row] = yield* database.query((db) =>
					db
						.select()
						.from(project)
						.where(
							and(
								eq(project.id, projectId),
								inArray(project.organizationId, [...principal.organizationIds]),
							),
						),
				);
				if (!row) return yield* new NotFound({ message: "Project not found" });
				return row;
			});

			const requireWrite = (principal: Principal) =>
				principal.kind === "token" && !principal.canWrite
					? Effect.fail(
							new Forbidden({ message: "This API token is read-only" }),
						)
					: Effect.void;

			const requireOrganization = (
				principal: Principal,
				organizationId: string,
			) =>
				principal.organizationIds.includes(organizationId)
					? Effect.void
					: Effect.fail(
							new Forbidden({ message: "Not a member of this organization" }),
						);

			return Access.of({
				fromHeaders,
				fromToken,
				fromUserId,
				fromOAuth,
				requireProject,
				requireWrite,
				requireOrganization,
			});
		}),
	);
}
