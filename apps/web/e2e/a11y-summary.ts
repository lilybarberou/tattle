/**
 * Prints the accessibility warnings of the last run, one line per page and
 * rule: `node e2e/a11y-summary.ts` after `pnpm test:e2e`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Spec = { tests: { results: { annotations?: Annotation[] }[] }[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };
type Annotation = { type: string; description?: string };

const file = fileURLToPath(
	new URL("../test-results/e2e-results.json", import.meta.url),
);
const report = JSON.parse(readFileSync(file, "utf8")) as { suites: Suite[] };

const warnings = new Set<string>();
const visit = (suite: Suite) => {
	for (const spec of suite.specs ?? [])
		for (const test of spec.tests)
			for (const result of test.results)
				for (const annotation of result.annotations ?? [])
					if (annotation.type === "a11y-warning" && annotation.description)
						// Drop the example element: one line per page and rule.
						warnings.add(
							annotation.description.replace(/ \(\d+× e\.g\. .*\)$/, ""),
						);
	for (const child of suite.suites ?? []) visit(child);
};
for (const suite of report.suites) visit(suite);

if (warnings.size === 0) console.log("No accessibility warning.");
for (const line of [...warnings].sort()) console.log(line);
