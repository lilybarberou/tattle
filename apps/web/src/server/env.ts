const REPOSITORY = "https://github.com/lilybarberou/tattle";

const required = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

export const env = {
	get baseUrl() {
		return required("BETTER_AUTH_URL").replace(/\/$/, "");
	},
	get secret() {
		return required("BETTER_AUTH_SECRET");
	},
	get storageDir() {
		return process.env.STORAGE_DIR ?? "./storage";
	},
	/**
	 * The running version, set when the Docker image is built: "0.2.0" for a
	 * release, "main (382e31e)" for the main branch image, "dev" from source.
	 * `url` opens its release notes, or its commit.
	 */
	get build(): { version: string; url?: string } {
		const version = process.env.TATTLE_BUILD_VERSION || "dev";
		const commit = process.env.TATTLE_BUILD_COMMIT || undefined;
		if (/^\d+\.\d+\.\d+/.test(version))
			return { version, url: `${REPOSITORY}/releases/tag/v${version}` };
		if (!commit) return { version };
		return {
			version: `${version} (${commit.slice(0, 7)})`,
			url: `${REPOSITORY}/commit/${commit}`,
		};
	},
};
