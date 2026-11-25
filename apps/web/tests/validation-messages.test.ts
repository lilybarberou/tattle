import { describe, expect, it } from "vitest";
import * as z from "zod";
import { validationIssues, validationMessage } from "#/i18n/validation";

describe("a value the server refused", () => {
	const issuesOf = (schema: z.ZodType, value: unknown) => {
		const result = schema.safeParse(value);
		if (result.success) throw new Error("expected a failure");
		// What TanStack Start's validator throws: the issues as JSON.
		return validationIssues(JSON.stringify(result.error.issues, null, 2));
	};
	const form = z.object({
		name: z.string().min(1).max(80),
		password: z.string().min(8),
		email: z.email(),
		site: z.url(),
	});
	const valid = {
		name: "Shop",
		password: "long enough",
		email: "a@example.com",
		site: "https://example.com",
	};

	it("reads as one sentence in each language", () => {
		const cases: Array<[unknown, string, string]> = [
			[{ ...valid, name: "" }, "Fill in this field", "Remplissez ce champ"],
			[
				{ ...valid, name: "x".repeat(81) },
				"Too long: at most 80 characters",
				"Trop long : au plus 80 caractères",
			],
			[
				{ ...valid, password: "short" },
				"Too short: at least 8 characters",
				"Trop court : au moins 8 caractères",
			],
			[
				{ ...valid, email: "nope" },
				"Enter a valid email address",
				"Saisissez une adresse e-mail valide",
			],
			[
				{ ...valid, site: "nope" },
				"Enter a valid address, starting with https://",
				"Saisissez une adresse valide, qui commence par https://",
			],
			[
				{ ...valid, name: 42 },
				"Some values are not valid. Check the form and try again.",
				"Certaines valeurs ne sont pas valides. Vérifiez le formulaire et réessayez.",
			],
		];
		for (const [value, english, french] of cases) {
			const issues = issuesOf(form, value);
			expect(issues).not.toBeNull();
			expect(validationMessage(issues ?? [], "en")).toBe(english);
			expect(validationMessage(issues ?? [], "fr")).toBe(french);
		}
	});

	it("leaves other errors alone", () => {
		expect(validationIssues("Issue #4 not found")).toBeNull();
		expect(validationIssues("[1, 2]")).toBeNull();
		expect(validationIssues("[not json")).toBeNull();
	});
});
