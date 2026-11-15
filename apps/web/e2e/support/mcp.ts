/**
 * Calls the MCP endpoint the way an agent does with an API token: one
 * stateless JSON-RPC request per call over Streamable HTTP.
 */
import type { APIRequestContext } from "@playwright/test";
import { APP_URL } from "../config.ts";

type JsonRpc = {
	result?: {
		content?: { type: string; text?: string }[];
		isError?: boolean;
	};
	error?: { code: number; message: string };
};

let id = 1;

/** The JSON-RPC message in a JSON or SSE (`data: …` lines) response. */
const readMessage = (contentType: string, body: string): JsonRpc => {
	if (!contentType.includes("text/event-stream")) return JSON.parse(body);
	const last = body
		.split("\n")
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.filter(Boolean)
		.at(-1);
	if (!last) throw new Error(`No data in the MCP response: ${body}`);
	return JSON.parse(last);
};

export type ToolResult = {
	status: number;
	isError: boolean;
	text: string;
	json: () => unknown;
};

export async function callTool(
	request: APIRequestContext,
	token: string,
	name: string,
	args: Record<string, unknown> = {},
): Promise<ToolResult> {
	const response = await request.post(`${APP_URL}/api/mcp`, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
			"mcp-protocol-version": "2025-06-18",
		},
		data: {
			jsonrpc: "2.0",
			id: id++,
			method: "tools/call",
			params: { name, arguments: args },
		},
	});
	const body = await response.text();
	if (response.status() !== 200)
		return {
			status: response.status(),
			isError: true,
			text: body,
			json: () => JSON.parse(body),
		};
	const message = readMessage(response.headers()["content-type"] ?? "", body);
	const text =
		message.error?.message ??
		message.result?.content?.map((c) => c.text ?? "").join("\n") ??
		"";
	return {
		status: 200,
		isError: Boolean(message.error || message.result?.isError),
		text,
		json: () => JSON.parse(text),
	};
}
