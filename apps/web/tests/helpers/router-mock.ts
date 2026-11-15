/**
 * A stand-in for TanStack Router's createFileRoute: the route is its options,
 * so a test calls `Route.server.handlers.POST({ request, params })` directly.
 */
export const createFileRoute =
	(_path?: string) =>
	<T>(options: T) =>
		options;
