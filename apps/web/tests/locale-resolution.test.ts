import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "#/db";
import { user } from "#/db/schema";
import * as fns from "#/server/fns";
import {
	requestContext,
	resetRequestContext,
	signInWith,
} from "./helpers/request-context";
import { setupTestDatabase } from "./helpers/runtime";
import { signUp } from "./helpers/session";

vi.mock("@tanstack/react-start", () => import("./helpers/start-mock"));
vi.mock("@tanstack/react-start/server", () => import("./helpers/start-mock"));

setupTestDatabase();
beforeEach(() => resetRequestContext());

describe("the dashboard's language", () => {
	it("follows Accept-Language for a visitor", async () => {
		requestContext.headers.set("accept-language", "fr-FR,fr;q=0.9");
		expect(await fns.getLocaleFn()).toEqual({
			locale: "fr",
			visitor: "fr",
			preference: null,
		});
		requestContext.headers.set("accept-language", "de-DE");
		expect((await fns.getLocaleFn()).locale).toBe("en");
	});

	it("is the person's choice over their browser's, and Auto goes back to it", async () => {
		const person = await signUp();
		signInWith(person.cookie);
		requestContext.headers.set("accept-language", "en-US");
		expect(await fns.getLocaleFn()).toEqual({
			locale: "en",
			visitor: "en",
			preference: "auto",
		});

		await fns.setLocalePreferenceFn({ data: { preference: "fr" } });
		expect(await fns.getLocaleFn()).toEqual({
			locale: "fr",
			visitor: "en",
			preference: "fr",
		});

		await fns.setLocalePreferenceFn({ data: { preference: "auto" } });
		requestContext.headers.set("accept-language", "fr");
		expect(await fns.getLocaleFn()).toEqual({
			locale: "fr",
			visitor: "fr",
			preference: "auto",
		});
	});

	it("remembers the browser's language for emails to someone on Auto", async () => {
		const person = await signUp();
		signInWith(person.cookie);
		requestContext.headers.set("accept-language", "fr-BE, en;q=0.5");
		await fns.getLocaleFn();
		const [row] = await db
			.select({ locale: user.locale, detected: user.detectedLocale })
			.from(user)
			.where(eq(user.id, person.userId));
		expect(row).toEqual({ locale: null, detected: "fr" });
	});

	it("can't be set without signing in", async () => {
		await expect(
			fns.setLocalePreferenceFn({ data: { preference: "fr" } }),
		).rejects.toMatchObject({ status: 401 });
	});
});
