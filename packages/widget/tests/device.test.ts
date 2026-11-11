import { describe, expect, it } from "vitest";
import { parseBrowser, parseOs } from "../src/collectors/device";

const UA = {
	chromeMac:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36",
	edgeWindows:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87",
	firefoxLinux:
		"Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
	safariIphone:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
	ipadDesktopMode:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
	chromeAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
	operaWindows7:
		"Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36 OPR/98.0.0.0",
	prestoOpera:
		"Opera/9.80 (Windows NT 6.1; WOW64) Presto/2.12.388 Version/12.18",
	chromeOs:
		"Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
	iosWebView:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

describe("parseBrowser", () => {
	it.each([
		[UA.chromeMac, "Chrome", "126.0.6478.127"],
		[UA.edgeWindows, "Edge", "126.0.2592.87"],
		[UA.firefoxLinux, "Firefox", "128.0"],
		[UA.safariIphone, "Safari", "17.5"],
		[UA.chromeAndroid, "Chrome", "126.0.6478.122"],
		[UA.operaWindows7, "Opera", "98.0.0.0"],
		[UA.prestoOpera, "Opera", "12.18"],
		[UA.iosWebView, "Safari", ""],
		["curl/8.0", "Unknown", ""],
	])("%s → %s %s", (ua, name, version) => {
		expect(parseBrowser(ua)).toEqual({ name, version });
	});
});

describe("parseOs", () => {
	it.each([
		[UA.chromeMac, "macOS", "10.15.7"],
		[UA.edgeWindows, "Windows", "10"],
		[UA.operaWindows7, "Windows", "7"],
		[UA.firefoxLinux, "Linux", ""],
		[UA.safariIphone, "iOS", "17.5.1"],
		[UA.chromeAndroid, "Android", "14"],
		[UA.chromeOs, "ChromeOS", "14541.0.0"],
		["curl/8.0", "Unknown", ""],
	])("%s → %s %s", (ua, name, version) => {
		expect(parseOs(ua)).toEqual({ name, version });
	});

	it("spots an iPad that pretends to be a Mac by its touch points", () => {
		expect(parseOs(UA.ipadDesktopMode, 5)).toEqual({
			name: "iOS",
			version: "17.4",
		});
		expect(parseOs(UA.ipadDesktopMode, 0)).toEqual({
			name: "macOS",
			version: "10.15.7",
		});
	});
});
