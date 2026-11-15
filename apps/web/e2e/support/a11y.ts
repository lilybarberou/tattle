/**
 * Automatic accessibility checks (axe-core), in warning mode: violations are
 * attached to the test report and printed, never fail the test. Each
 * distinct problem is printed once per worker, so a page visited by many
 * tests does not flood the output.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";

const seen = new Set<string>();

export type A11yOptions = {
	/** Only this part of the page, e.g. the widget's host element. */
	include?: string;
	/** Parts of the page that are not ours (the customer's site around the widget). */
	exclude?: string[];
};

export async function checkA11y(
	page: Page,
	testInfo: TestInfo,
	label: string,
	options: A11yOptions = {},
) {
	let builder = new AxeBuilder({ page }).withTags([
		"wcag2a",
		"wcag2aa",
		"wcag21a",
		"wcag21aa",
		"wcag22aa",
		"best-practice",
	]);
	if (options.include) builder = builder.include(options.include);
	for (const selector of options.exclude ?? [])
		builder = builder.exclude(selector);
	let violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];
	try {
		({ violations } = await builder.analyze());
	} catch (error) {
		// A check that cannot run is a warning too, never a failure.
		testInfo.annotations.push({
			type: "a11y-warning",
			description: `${label}: axe could not run (${String(error).slice(0, 200)})`,
		});
		return [];
	}
	if (violations.length === 0) return [];
	const summary = violations.map((v) => ({
		rule: v.id,
		impact: v.impact,
		help: v.help,
		nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
		count: v.nodes.length,
	}));
	await testInfo.attach(`a11y ${label}`, {
		body: JSON.stringify(summary, null, 2),
		contentType: "application/json",
	});
	for (const v of summary) {
		testInfo.annotations.push({
			type: "a11y-warning",
			description: `${label}: [${v.impact}] ${v.rule} — ${v.help} (${v.count}× e.g. ${v.nodes[0]})`,
		});
		const key = `${label}|${v.rule}`;
		if (seen.has(key)) continue;
		seen.add(key);
		console.warn(
			`[a11y] ${label}: [${v.impact}] ${v.rule} — ${v.help} (${v.count}× e.g. ${v.nodes[0]})`,
		);
	}
	return summary;
}
