import { describe, expect, it } from "vitest";
import { Latest } from "../src/latest";

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
};

describe("Latest", () => {
	it("keeps only the newest request current", () => {
		const latest = new Latest();
		const first = latest.next();
		expect(first()).toBe(true);
		const second = latest.next();
		expect(first()).toBe(false);
		expect(second()).toBe(true);
		latest.cancel();
		expect(second()).toBe(false);
	});

	it("drops a slower, earlier conversation that answers after the newer one", async () => {
		const latest = new Latest();
		let shown: string | null = null;
		const open = async (answer: Promise<string>) => {
			const isLatest = latest.next();
			const thread = await answer;
			if (isLatest()) shown = thread;
		};
		const a = deferred<string>();
		const b = deferred<string>();
		const openingA = open(a.promise);
		latest.cancel(); // back to the list
		const openingB = open(b.promise);
		b.resolve("B");
		await openingB;
		a.resolve("A");
		await openingA;
		expect(shown).toBe("B");
	});

	it("drops the answer once the reporter has left, even for the same conversation", async () => {
		const latest = new Latest();
		let shown: string | null = null;
		const first = deferred<string>();
		const isLatest = latest.next();
		const opening = first.promise.then((thread) => {
			if (isLatest()) shown = thread;
		});
		latest.cancel();
		latest.next(); // the same conversation, opened again
		first.resolve("A (old)");
		await opening;
		expect(shown).toBeNull();
	});
});
