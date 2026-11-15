import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isPrivateAddress } from "./private-address";

/**
 * A DNS lookup that refuses names resolving to a private address. It runs
 * when the connection opens, on the address actually dialed: checking the
 * name first and connecting after would resolve it twice, and a name can
 * answer a public address to the check and 127.0.0.1 to the connection
 * (DNS rebinding).
 */
export const publicOnlyLookup: LookupFunction = (
	hostname,
	options,
	callback,
) => {
	dnsLookup(
		hostname,
		{ ...options, all: true, verbatim: true },
		(error, addresses: LookupAddress[]) => {
			if (error) return callback(error, "", 0);
			if (
				addresses.length === 0 ||
				addresses.some((entry) => isPrivateAddress(entry.address))
			) {
				const refused: NodeJS.ErrnoException = new Error(
					`Refused: ${hostname} resolves to a private address`,
				);
				refused.code = "EPRIVATEADDRESS";
				return callback(refused, "", 0);
			}
			if (options.all) return callback(null, addresses);
			const [first] = addresses as [LookupAddress];
			callback(null, first.address, first.family);
		},
	);
};

/**
 * POSTs a body and resolves with the response status, never following a
 * redirect and never reading the response body. With `publicOnly`, the
 * connection is refused when the host resolves to a private address.
 */
export const postPublic = (
	url: string,
	init: {
		headers: Record<string, string>;
		body: string;
		signal: AbortSignal;
		publicOnly: boolean;
	},
) =>
	new Promise<number>((resolve, reject) => {
		const target = new URL(url);
		const client = target.protocol === "https:" ? https : http;
		const request = client.request(target, {
			method: "POST",
			headers: {
				...init.headers,
				"content-length": String(Buffer.byteLength(init.body)),
			},
			signal: init.signal,
			// A fresh connection each time: a kept-alive socket was dialed
			// under an earlier lookup.
			agent: false,
			...(init.publicOnly ? { lookup: publicOnlyLookup } : {}),
		});
		request.on("response", (response) => {
			response.resume();
			resolve(response.statusCode ?? 0);
		});
		request.on("error", (error) =>
			reject(init.signal.aborted ? init.signal.reason : error),
		);
		request.end(init.body);
	});
