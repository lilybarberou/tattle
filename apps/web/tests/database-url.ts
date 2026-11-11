/**
 * The database the tests use. Never the dev database: every test file empties
 * the tables, so the name must end in `_test`.
 */
export const testDatabaseUrl =
	process.env.TEST_DATABASE_URL ??
	"postgres://tattle:tattle@localhost:5434/tattle_test";

const name = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!name.endsWith("_test")) {
	throw new Error(
		`Refusing to run tests against "${name}": the database name must end in _test.`,
	);
}
export const testDatabaseName = name;
