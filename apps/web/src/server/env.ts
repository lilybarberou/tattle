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
};
