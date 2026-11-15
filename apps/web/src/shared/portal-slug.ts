// The address of a project's public page (/portal/<slug>): 3 to 40 lowercase
// letters, digits or dashes, not starting with a dash. Shared by the settings
// form (its `pattern` attribute) and the server's check, so both accept the
// same addresses. Keep it free of server-only imports.

/**
 * For the HTML `pattern` attribute. Browsers compile it with the `v` flag,
 * where a literal `-` inside a character class must be escaped: unescaped,
 * the pattern is invalid and the browser silently skips the check.
 */
export const PORTAL_SLUG_PATTERN = "[a-z0-9][a-z0-9\\-]{2,39}";

/**
 * The whole value must match, as with the `pattern` attribute. The `u` flag
 * reads this pattern as `v` does, and older browsers that load this module
 * know it.
 */
const portalSlugRegex = new RegExp(`^(?:${PORTAL_SLUG_PATTERN})$`, "u");

export const isPortalSlug = (value: string) => portalSlugRegex.test(value);
