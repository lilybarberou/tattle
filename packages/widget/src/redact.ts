const SENSITIVE_KEY =
	/token|key|secret|password|auth|session|code|signature|credential|jwt|^sig$/i;
const MAX_URL_LENGTH = 2000;

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value.replace(/\+/g, " "));
	} catch {
		return value;
	}
}

/** Replaces the value of every `key=value` pair whose key looks sensitive. */
function redactPairs(query: string): string {
	return query
		.split("&")
		.map((part) => {
			const eq = part.indexOf("=");
			if (eq === -1) return part;
			const key = part.slice(0, eq);
			return SENSITIVE_KEY.test(safeDecode(key)) ? `${key}=[redacted]` : part;
		})
		.join("&");
}

/**
 * Resolves `input` against the current page and redacts sensitive query
 * (and hash) parameter values. Data/blob URLs are shortened.
 */
export function redactUrl(input: string): string {
	if (/^(data|blob):/i.test(input)) {
		return `${input.slice(0, input.indexOf(",") + 1 || 40)}[...]`;
	}
	let url = input;
	try {
		url = new URL(input, location.href).href;
	} catch {
		// keep raw input
	}
	const hashIdx = url.indexOf("#");
	let hash = "";
	if (hashIdx !== -1) {
		hash = url.slice(hashIdx + 1);
		url = url.slice(0, hashIdx);
	}
	const qIdx = url.indexOf("?");
	if (qIdx !== -1) {
		url = `${url.slice(0, qIdx)}?${redactPairs(url.slice(qIdx + 1))}`;
	}
	if (hashIdx !== -1) {
		// Only touch fragments that look like query strings (e.g. OAuth "#access_token=…").
		url += `#${hash.includes("=") ? redactPairs(hash) : hash}`;
	}
	// "https://user:password@host/": the credentials go, the host stays.
	url = url.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/?#@]*@/i, "$1[redacted]@");
	return url.length > MAX_URL_LENGTH ? `${url.slice(0, MAX_URL_LENGTH)}…` : url;
}

const JWT = /\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g;
const AUTH_SCHEME = /\b(Bearer|Basic|Token)(\s*[:=]\s*|\s+)([\w.~+/=-]{8,})/gi;
/**
 * Whether the word after "Bearer", "Basic" or "Token" can be a credential:
 * one with a digit, a symbol, camel or base64 casing, or 16 characters or
 * more. "Token refreshed" and "basic configuration" are plain English.
 */
const looksLikeSecret = (value: string) =>
	value.length >= 16 || /[\d.~+/=_-]|[a-z][A-Z]/.test(value);
const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>`]+/gi;
/**
 * What follows a URL in a stack frame or a sentence without being part of it:
 * a ":line:column" position (with the frame's closing parenthesis) or
 * trailing punctuation. Redacting a parameter's value would swallow it.
 */
const AFTER_URL = /(?::\d+){1,2}\)?$|[).,;!?]+$/;

/**
 * Removes credentials from free text, such as a console message: JWTs,
 * `Bearer …`/`Basic …`/`Token …` values that look like one, `token: …` and
 * `token=…`, and the sensitive parameters and user info of the URLs it
 * contains.
 */
export function scrubText(text: string): string {
	return text
		.replace(URL_IN_TEXT, (match) => {
			const after = AFTER_URL.exec(match)?.[0] ?? "";
			const url = match.slice(0, match.length - after.length);
			return (/[?#@]/.test(url) ? redactUrl(url) : url) + after;
		})
		.replace(JWT, "[redacted]")
		.replace(
			AUTH_SCHEME,
			(match, scheme: string, separator: string, value: string) =>
				/[:=]/.test(separator) || looksLikeSecret(value)
					? `${scheme}${separator}[redacted]`
					: match,
		);
}
