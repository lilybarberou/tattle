import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

export type ReceivedRequest = {
	method: string;
	headers: IncomingHttpHeaders;
	body: string;
};

/** A throwaway HTTP server on a random port that records what it receives. */
export const startReceiver = async (
	status = 200,
	headers: Record<string, string> = {},
) => {
	const requests: ReceivedRequest[] = [];
	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			requests.push({
				method: req.method ?? "",
				headers: req.headers,
				body: Buffer.concat(chunks).toString("utf8"),
			});
			res.writeHead(status, { "content-type": "text/plain", ...headers });
			res.end("ok");
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}/hook`,
		requests,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
};
