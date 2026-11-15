/**
 * Test data written straight to the e2e database, so each test starts from
 * its own people, organization and project without replaying the sign-up
 * and onboarding screens (those have their own tests). Every name and email
 * is unique: tests running in parallel never see each other's data.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import { DATABASE_URL, PASSWORD } from "../config.ts";

let pool: pg.Pool | undefined;
export const db = () => {
	pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
	return pool;
};
export const closeDb = async () => {
	await pool?.end();
	pool = undefined;
};

export const unique = (prefix: string) =>
	`${prefix}-${randomUUID().slice(0, 8)}`;

export type SeededUser = {
	id: string;
	name: string;
	email: string;
	password: string;
};

let passwordHash: Promise<string> | undefined;

/** A person with an email and password account, in no organization yet. */
export async function seedUser(name = "Ada"): Promise<SeededUser> {
	const id = randomUUID();
	const email = `${unique(name.toLowerCase().replace(/\W+/g, "-"))}@example.test`;
	passwordHash ??= hashPassword(PASSWORD);
	const now = new Date();
	await db().query(
		`insert into "user" (id, name, email, email_verified, created_at, updated_at)
		 values ($1, $2, $3, false, $4, $4)`,
		[id, name, email, now],
	);
	await db().query(
		`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		 values ($1, $2, 'credential', $2, $3, $4, $4)`,
		[randomUUID(), id, await passwordHash, now],
	);
	return { id, name, email, password: PASSWORD };
}

export type Role = "owner" | "admin" | "member";

export async function addMember(
	organizationId: string,
	userId: string,
	role: Role,
) {
	await db().query(
		`insert into member (id, organization_id, user_id, role, created_at)
		 values ($1, $2, $3, $4, now())`,
		[randomUUID(), organizationId, userId, role],
	);
}

export type SeededWorkspace = {
	owner: SeededUser;
	organization: { id: string; name: string };
	project: { id: string; name: string; publicKey: string };
};

/** An organization owned by a new person, with one project. */
export async function seedWorkspace(
	options: { ownerName?: string; projectName?: string } = {},
): Promise<SeededWorkspace> {
	const owner = await seedUser(options.ownerName ?? "Olivia");
	const organization = { id: randomUUID(), name: unique("Org") };
	await db().query(
		`insert into organization (id, name, slug, created_at) values ($1, $2, $3, now())`,
		[organization.id, organization.name, organization.name.toLowerCase()],
	);
	await addMember(organization.id, owner.id, "owner");
	const project = {
		id: randomUUID(),
		name: options.projectName ?? "Shop",
		publicKey: `pk_${randomBytes(16).toString("hex")}`,
	};
	await db().query(
		`insert into project (id, organization_id, name, slug, public_key)
		 values ($1, $2, $3, $4, $5)`,
		[
			project.id,
			organization.id,
			project.name,
			project.name.toLowerCase(),
			project.publicKey,
		],
	);
	return { owner, organization, project };
}

/** One row of a table, for checks the UI cannot show. */
export async function queryOne<T>(sql: string, params: unknown[]) {
	const { rows } = await db().query(sql, params);
	return rows[0] as T | undefined;
}
