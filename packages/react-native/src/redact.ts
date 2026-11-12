const SENSITIVE_KEY = /token|key|secret|password|auth|session|code/i;
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
 * Redacts sensitive query (and hash) parameter values, and shortens data and
 * blob URLs. Same rules as the web widget.
 */
export function redactUrl(input: string): string {
	if (/^(data|blob):/i.test(input)) {
		return `${input.slice(0, input.indexOf(",") + 1 || 40)}[...]`;
	}
	let url = input;
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
		url += `#${hash.includes("=") ? redactPairs(hash) : hash}`;
	}
	return url.length > MAX_URL_LENGTH ? `${url.slice(0, MAX_URL_LENGTH)}…` : url;
}
