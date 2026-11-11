import { Context, Effect, Layer } from "effect";
import { type Db, db } from "#/db";
import { DbError } from "./errors";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class Database extends Context.Service<
	Database,
	{
		readonly query: <A>(f: (db: Db) => Promise<A>) => Effect.Effect<A, DbError>;
		readonly transaction: <A>(
			f: (tx: Tx) => Promise<A>,
		) => Effect.Effect<A, DbError>;
	}
>()("tattle/server/Database") {
	static readonly layer = Layer.succeed(Database)({
		query: (f) =>
			Effect.tryPromise({
				try: () => f(db),
				catch: (cause) => new DbError({ cause }),
			}),
		transaction: (f) =>
			Effect.tryPromise({
				try: () => db.transaction(f),
				catch: (cause) => new DbError({ cause }),
			}),
	});
}
