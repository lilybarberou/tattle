import { describe, expect, it } from "vitest";
import { checkUrlHost, isPrivateAddress } from "#/server/private-address";

describe("isPrivateAddress", () => {
	it("flags loopback, private, link-local, unique-local and unspecified addresses", () => {
		for (const address of [
			"127.0.0.1",
			"127.255.0.9",
			"0.0.0.0",
			"10.1.2.3",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.0.1",
			"169.254.169.254",
			"100.64.0.1",
			"::",
			"::1",
			"::ffff:127.0.0.1",
			"::ffff:7f00:1",
			"::ffff:a9fe:a9fe",
			"0:0:0:0:0:ffff:10.0.0.1",
			"::127.0.0.1",
			"64:ff9b::10.0.0.1",
			"2002:7f00:1::",
			"fc00::1",
			"fd12:3456::1",
			"fe80::1",
			"fe80::1%en0",
			"ff02::1",
		]) {
			expect(isPrivateAddress(address), address).toBe(true);
		}
	});

	it("lets public addresses through", () => {
		for (const address of [
			"1.1.1.1",
			"8.8.8.8",
			"172.32.0.1",
			"203.0.113.10",
			"2606:4700:4700::1111",
			"::ffff:8.8.8.8",
			"64:ff9b::8.8.8.8",
		]) {
			expect(isPrivateAddress(address), address).toBe(false);
		}
	});

	it("treats anything that is not an address as private", () => {
		expect(isPrivateAddress("not-an-ip")).toBe(true);
	});
});

describe("checkUrlHost", () => {
	it("checks every address a name resolves to", async () => {
		const resolve = async () => ["8.8.8.8", "::1"];
		expect(await checkUrlHost("https://rebind.example/v1", resolve)).toBe(
			"private",
		);
		expect(
			await checkUrlHost("https://api.example/v1", async () => [
				"8.8.8.8",
				"2606:4700:4700::1111",
			]),
		).toBe("public");
	});

	it("reads IP literals without resolving them", async () => {
		const resolve = async () => {
			throw new Error("should not resolve");
		};
		expect(await checkUrlHost("http://[::ffff:127.0.0.1]:8080/", resolve)).toBe(
			"private",
		);
		expect(await checkUrlHost("http://0x7f.1/v1", resolve)).toBe("private");
		expect(await checkUrlHost("http://8.8.8.8/v1", resolve)).toBe("public");
	});

	it("says when a name does not resolve", async () => {
		expect(
			await checkUrlHost("https://nowhere.example/v1", async () => {
				throw new Error("ENOTFOUND");
			}),
		).toBe("unresolved");
		expect(await checkUrlHost("https://empty.example/", async () => [])).toBe(
			"unresolved",
		);
	});
});
