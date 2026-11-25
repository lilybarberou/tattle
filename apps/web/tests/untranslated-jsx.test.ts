import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";

// Text written straight into JSX (or a toast) skips the catalogues: it
// would show in English on a French page. esbuild compiles each component,
// so JSX text becomes `children: "…"` and attributes become `title: "…"`,
// which a few patterns find without a TypeScript parser.

const src = fileURLToPath(new URL("../src", import.meta.url));
const FOLDERS = ["routes", "components"];

/** Names and symbols that read the same in every language. */
const ALLOWED = new Set([
	"Tattle",
	"Markdown",
	"GitHub",
	"Discord",
	"Slack",
	"Claude Code",
	"Atelier Nord",
	"XXXX-XXXX-XXXX",
	"ERR",
	"Fixes Tattle #12",
	"closes tattle#12",
]);

const tsxFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return tsxFiles(path);
		return path.endsWith(".tsx") ? [path] : [];
	});

const ATTRIBUTE =
	/(?:"aria-label"|"aria-description"|placeholder|alt|title): "((?:[^"\\]|\\.)*)"/g;
const CHILD = /children: "((?:[^"\\]|\\.)*)"/g;
const TOAST =
	/toast(?:\.(?:success|error|info|warning|message))?\(\s*"((?:[^"\\]|\\.)*)"/g;
const CHILDREN = /children: \[/g;

/** The next character that is not a space, from `i` going by `step`. */
const around = (code: string, i: number, step: 1 | -1) => {
	let j = i;
	while (/\s/.test(code[j] ?? "")) j += step;
	return code[j];
};

/**
 * The string elements of the children array opening at `start`: text
 * between tags, not strings inside the expressions next to it.
 */
const arrayStrings = (code: string, start: number) => {
	const found: string[] = [];
	let depth = 0;
	for (let i = start; i < code.length; i++) {
		const c = code[i];
		if (c === '"') {
			let end = i + 1;
			while (end < code.length && code[end] !== '"')
				end += code[end] === "\\" ? 2 : 1;
			const element =
				depth === 1 &&
				["[", ","].includes(around(code, i - 1, -1) ?? "") &&
				[",", "]"].includes(around(code, end + 1, 1) ?? "");
			if (element) found.push(code.slice(i + 1, end));
			i = end;
		} else if (c === "`") {
			let end = i + 1;
			while (end < code.length && code[end] !== "`")
				end += code[end] === "\\" ? 2 : 1;
			i = end;
		} else if (c === "[" || c === "(" || c === "{") depth++;
		else if (c === "]" || c === ")" || c === "}") {
			depth--;
			// `children: ["a", "b"].map(…)`: an expression, not text.
			if (depth === 0) return around(code, i + 1, 1) === "." ? [] : found;
		}
	}
	return found;
};

/** A string literal's value; the code is our own, compiled by esbuild. */
const unquote = (raw: string) =>
	new Function(`"use strict"; return "${raw}";`)() as string;

/** Code, settings and addresses shown as they are: `<code>REPORT_RETENTION_DAYS</code>`. */
const CODE = /^[\w$@#.\-/:<>[\]=,'()]+$/;

/** Whether a string is words someone reads, not a symbol, code or a name. */
const isProse = (raw: string) => {
	const text = unquote(raw).trim();
	if (!/[A-Za-z]{2,}/.test(text) || ALLOWED.has(text)) return false;
	if (/[_$=<>{}]|\w\(/.test(text)) return false;
	return !(CODE.test(text) && /[\W\d]/.test(text));
};

const untranslatedText = (source: string) => {
	const { code } = transformSync(source, {
		loader: "tsx",
		jsx: "automatic",
		// Comments and unused code do not reach a page.
		legalComments: "none",
	});
	const found = [
		...[...code.matchAll(ATTRIBUTE)].map((m) => m[1] as string),
		...[...code.matchAll(CHILD)].map((m) => m[1] as string),
		...[...code.matchAll(TOAST)].map((m) => m[1] as string),
		...[...code.matchAll(CHILDREN)].flatMap((m) =>
			arrayStrings(code, (m.index ?? 0) + m[0].length - 1),
		),
	];
	return found.filter(isProse).map(unquote);
};

describe("JSX text", () => {
	it("is found by the check", () => {
		expect(
			untranslatedText(`
				export const A = ({ n }: { n: number }) => (
					<p title="Open it" aria-label={label} onClick={() => toast.error("Not saved")}>
						Hello <b>{n}</b> world · {"—"}
						<span>{m.x}</span>
					</p>
				);
			`),
		).toEqual(["Open it", "Not saved", "Hello ", " world · "]);
	});

	it("comes from the catalogues in every page and component", () => {
		const leftovers = FOLDERS.flatMap((folder) =>
			tsxFiles(join(src, folder)).flatMap((file) =>
				untranslatedText(readFileSync(file, "utf8")).map(
					(text) => `${relative(src, file)}: ${JSON.stringify(text)}`,
				),
			),
		);
		expect(leftovers).toEqual([]);
	});
});
