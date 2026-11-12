import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, safeUrl } from "#/components/markdown";

const render = (source: string) =>
	renderToStaticMarkup(<Markdown>{source}</Markdown>);

describe("Markdown", () => {
	it("renders GitHub-flavoured Markdown", () => {
		const html = render(
			[
				"## Steps",
				"",
				"1. Open **settings**",
				"2. ~~Click~~ Tap `Save`",
				"",
				"- [x] reproduced",
				"- [ ] fixed",
				"",
				"| Browser | OK |",
				"| --- | --- |",
				"| Safari | no |",
				"",
				"```ts",
				"const a = 1 < 2;",
				"```",
				"",
				"See https://example.com/docs",
			].join("\n"),
		);
		expect(html).toContain("<h2>Steps</h2>");
		expect(html).toContain("<strong>settings</strong>");
		expect(html).toContain("<del>Click</del>");
		expect(html).toContain("<code>Save</code>");
		expect(html).toContain("<table>");
		expect(html).toContain('<code class="language-ts">const a = 1 &lt; 2;');
		// Task lists are shown, not editable.
		expect(html).toMatch(/<input type="checkbox" disabled="" checked=""\/>/);
		expect(html).toContain(
			'<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer nofollow">https://example.com/docs</a>',
		);
	});

	it("shows raw HTML as text", () => {
		const html = render(
			'Hi <script>alert(1)</script> <img src="x" onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>',
		);
		expect(html).not.toContain("<script");
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<iframe");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain("&lt;iframe");
	});

	it("drops links that are not http, https or mailto", () => {
		const html = render(
			[
				"[a](javascript:alert(1))",
				"[b](JaVaScRiPt:alert(1))",
				"[c](data:text/html,<script>alert(1)</script>)",
				"[d](vbscript:msgbox)",
				"[e](/settings)",
				"[f](//evil.example)",
				"<javascript:alert(1)>",
			].join(" "),
		);
		expect(html).not.toContain("href=");
		expect(html).not.toContain("<a");
		expect(html).toContain("<span>a</span>");
		expect(html).toContain("<span>f</span>");
	});

	it("keeps mailto links in the same tab", () => {
		expect(render("[mail](mailto:team@example.com)")).toContain(
			'<a href="mailto:team@example.com" rel="nofollow">mail</a>',
		);
	});

	it("never loads an image: it becomes a link", () => {
		const html = render(
			"![screenshot](https://tracker.example/pixel.gif) ![](javascript:alert(1))",
		);
		expect(html).not.toContain("<img");
		expect(html).toContain('href="https://tracker.example/pixel.gif"');
		expect(html).toContain("screenshot</a>");
		// An unsafe image is only its label.
		expect(html).toContain("<span>Image</span>");
		expect(html).not.toContain("javascript:");
	});
});

describe("safeUrl", () => {
	it("keeps web, mail and same-page links", () => {
		expect(safeUrl("https://example.com/a?b=1")).toBe(
			"https://example.com/a?b=1",
		);
		expect(safeUrl("http://example.com")).toBe("http://example.com/");
		expect(safeUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
		expect(safeUrl("#user-content-fn-1")).toBe("#user-content-fn-1");
	});

	it("refuses every other scheme and relative paths", () => {
		for (const url of [
			"javascript:alert(1)",
			" javascript:alert(1)",
			"java\tscript:alert(1)",
			"data:image/png;base64,AAAA",
			"file:///etc/passwd",
			"/p/abc",
			"../x",
			"//evil.example",
			"#a b",
		])
			expect(safeUrl(url), url).toBe("");
	});
});
