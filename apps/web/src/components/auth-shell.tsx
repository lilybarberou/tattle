import type { Messages } from "#/i18n";
import { Brand } from "./brand";

/**
 * A Better Auth error in the reader's language: its code when we know it,
 * else its own message (the server's hooks already write theirs in the
 * reader's language), else the fallback.
 */
export const authErrorMessage = (
	m: Messages,
	error: { code?: string; message?: string; status?: number },
	fallback: string,
) => {
	if (error.status === 429) return m.auth.tooManyAttempts;
	const known = error.code
		? (m.auth.errorCodes as Record<string, string>)[error.code]
		: undefined;
	return known ?? error.message ?? fallback;
};

/** The frame of the signed-out pages: the mark above one white card. */
export function AuthShell({
	title,
	intro,
	children,
}: {
	title: string;
	intro?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ground px-4 py-10">
			<Brand className="text-base" />
			<div className="w-full max-w-sm space-y-6 rounded-2xl border bg-surface p-7">
				<div className="space-y-1">
					<h1 className="text-xl font-semibold">{title}</h1>
					{intro && <p className="text-muted-foreground">{intro}</p>}
				</div>
				{children}
			</div>
		</main>
	);
}
