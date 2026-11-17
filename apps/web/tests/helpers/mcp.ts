import { expect } from "vitest";
import { handleMcpRequest } from "#/server/mcp";

export type JsonRpcResponse = {
	jsonrpc: "2.0";
	id: number | null;
	result?: {
		tools?: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
		content?: Array<{
			type: string;
			text?: string;
			data?: string;
			mimeType?: string;
		}>;
		isError?: boolean;
	};
	error?: { code: number; message: string };
};

let nextId = 1;
export const mcpRequest = (method: string, params: object, token?: string) =>
	new Request("http://localhost:3000/api/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2025-06-18",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
	});

/** Reads a JSON or SSE (`data: …` lines) response into its JSON-RPC message. */
export const readMessage = async (
	response: Response,
): Promise<JsonRpcResponse> => {
	const body = await response.text();
	if (!response.headers.get("content-type")?.includes("text/event-stream")) {
		return JSON.parse(body);
	}
	const data = body
		.split("\n")
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.filter(Boolean);
	const last = data.at(-1);
	if (!last) throw new Error(`No data in SSE response: ${body}`);
	return JSON.parse(last);
};

/** Calls a tool with an API token; the HTTP exchange itself must succeed. */
export const call = async (token: string, name: string, args: object) => {
	const response = await handleMcpRequest(
		mcpRequest("tools/call", { name, arguments: args }, token),
	);
	expect(response.status).toBe(200);
	return readMessage(response);
};
