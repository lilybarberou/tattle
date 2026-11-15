import * as z from "zod/mini";

/**
 * An optional search parameter that is dropped, instead of failing the
 * page, when its value is not one the page knows: an old bookmark, a
 * hand-edited URL (`?view=bogus`, `?selected=abc`). The page then shows
 * its default.
 */
export const lenient = <T extends z.core.SomeType>(schema: T) =>
	z.catch(z.optional(schema), undefined);
