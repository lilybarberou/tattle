/**
 * The request a server function or API route sees in the tests. The doubles
 * of `@tanstack/react-start` and `@tanstack/react-start/server` (see
 * start-mock.ts) read it instead of TanStack Start's request context.
 */
export const requestContext = {
	headers: new Headers(),
	ip: "203.0.113.7" as string | undefined,
	/** Cookies the request carries; setCookie() writes here too. */
	cookies: new Map<string, string>(),
	/** Every cookie a handler set, with its options. */
	setCookies: [] as { name: string; value: string; options: unknown }[],
};

/** A fresh, anonymous request from another IP. */
export const resetRequestContext = (ip = "203.0.113.7") => {
	requestContext.headers = new Headers();
	requestContext.ip = ip;
	requestContext.cookies.clear();
	requestContext.setCookies.length = 0;
};

/** The next server function calls run as the person behind this cookie. */
export const signInWith = (cookie: string) => {
	requestContext.headers = new Headers({ cookie });
};

export const signOut = () => {
	requestContext.headers = new Headers();
};
