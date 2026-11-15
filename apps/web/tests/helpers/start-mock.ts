import { requestContext } from "./request-context";

type Validator = { parse: (input: unknown) => unknown };
type Handler = (ctx: { data: never }) => unknown;

/**
 * A stand-in for TanStack Start's createServerFn: without the Vite plugin,
 * a server function is its handler, called with the validated data, the way
 * the RPC endpoint calls it.
 */
export const createServerFn = (_options?: { method?: string }) => {
	let validator: Validator | undefined;
	const builder = {
		validator(schema: Validator) {
			validator = schema;
			return builder;
		},
		inputValidator(schema: Validator) {
			validator = schema;
			return builder;
		},
		handler(fn: Handler) {
			return async (input?: { data?: unknown }) => {
				const data = validator ? validator.parse(input?.data) : input?.data;
				return fn({ data: data as never });
			};
		},
	};
	return builder;
};

const cookieHeader = () =>
	[...requestContext.cookies]
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");

export const getRequest = () => {
	const headers = new Headers(requestContext.headers);
	const extra = cookieHeader();
	if (extra) {
		const existing = headers.get("cookie");
		headers.set("cookie", existing ? `${existing}; ${extra}` : extra);
	}
	return new Request("http://localhost:3000/_serverFn", { headers });
};

export const getRequestIP = () => requestContext.ip;

export const getCookie = (name: string) => requestContext.cookies.get(name);

export const setCookie = (name: string, value: string, options?: unknown) => {
	requestContext.cookies.set(name, value);
	requestContext.setCookies.push({ name, value, options });
};
