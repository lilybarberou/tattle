// What a report says about where it came from: a web page or an app screen,
// and the browser or the phone. Shared by the dashboard and the Discord and
// Slack messages: keep it free of server-only imports.

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const record = (value: unknown) =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

/** True when the page is a web address, false for a mobile app's screen name. */
export const isWebPage = (pageUrl: string) => /^https?:\/\//i.test(pageUrl);

/**
 * Short labels for a report's device. Web reports describe a browser; mobile
 * SDKs send `app` (name, version, build) and `model` instead.
 */
export const deviceSummary = (device: Record<string, unknown>) => {
	const browser = record(device.browser);
	const app = record(device.app);
	const os = record(device.os);
	const viewport = record(device.viewport);
	const model = [str(device.manufacturer), str(device.model)]
		.filter(Boolean)
		.join(" ");
	const appVersion = [
		str(app?.version),
		str(app?.build) ? `(${str(app?.build)})` : undefined,
	]
		.filter(Boolean)
		.join(" ");
	return {
		mobile:
			!browser && (device.platform === "ios" || device.platform === "android"),
		browser: browser
			? `${str(browser.name) ?? ""} ${str(browser.version)?.split(".")[0] ?? ""}`.trim()
			: undefined,
		app: app
			? `${str(app.name) ?? ""} ${appVersion}`.trim() || undefined
			: undefined,
		model: model || undefined,
		os: os
			? `${str(os.name) ?? ""} ${str(os.version) ?? ""}`.trim()
			: undefined,
		viewport: viewport?.width
			? `${viewport.width} × ${viewport.height}`
			: undefined,
	};
};
