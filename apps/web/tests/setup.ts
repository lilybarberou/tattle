import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

// Each test file stores its screenshots in its own temporary folder. The
// Storage layer reads STORAGE_DIR when the runtime starts, after this runs.
const storageDir = mkdtempSync(join(tmpdir(), "tattle-test-"));
process.env.STORAGE_DIR = storageDir;

afterAll(() => {
	rmSync(storageDir, { recursive: true, force: true });
});
