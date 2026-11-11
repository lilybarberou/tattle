/** Password rules, read from the environment so each server can choose. */
export const passwordPolicy = () => {
	const value = Number(process.env.MIN_PASSWORD_LENGTH ?? 8);
	return {
		minLength:
			Number.isInteger(value) && value >= 6 && value <= 128 ? value : 8,
		// Rejects passwords found in known data breaches (Have I Been Pwned).
		// Only the first 5 characters of the password's SHA-1 hash leave the
		// server. Set PASSWORD_BREACH_CHECK=false on servers without internet.
		breachCheck: process.env.PASSWORD_BREACH_CHECK !== "false",
	};
};
