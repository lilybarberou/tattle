// AI providers for duplicate suggestions, shared by the server and the settings
// page. Keep this file free of server-only imports.

export const AI_PROVIDERS = [
	"anthropic",
	"openai",
	"openai_compatible",
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_META: Record<
	AiProvider,
	{
		label: string;
		/** A cheap, fast model; empty when there is no sensible default. */
		defaultModel: string;
		/** Where the key comes from, shown under the key field. */
		keyHelp: string;
	}
> = {
	anthropic: {
		label: "Anthropic",
		defaultModel: "claude-haiku-5-5",
		keyHelp: "From console.anthropic.com → API keys.",
	},
	openai: {
		label: "OpenAI",
		defaultModel: "gpt-5-mini",
		keyHelp: "From platform.openai.com → API keys.",
	},
	openai_compatible: {
		label: "OpenAI-compatible",
		defaultModel: "",
		keyHelp:
			"Mistral, OpenRouter, Ollama, LM Studio… Leave the key empty if the server needs none.",
	},
};

/** What the browser sees of the workspace's AI settings: never the key. */
export type AiSettingsView = {
	canManage: boolean;
	configured: boolean;
	provider: AiProvider;
	baseUrl: string;
	model: string;
	enabled: boolean;
	/** The last 4 characters of the saved key, or null when there is none. */
	keyLast4: string | null;
	/** The key was saved under another BETTER_AUTH_SECRET and must be entered again. */
	keyUnreadable: boolean;
	updatedAt: string | null;
};

/** A suggestion that an issue duplicates another, as shown in Triage and to agents. */
export type DuplicateSuggestionView = {
	id: string;
	/** "ai": the workspace's AI judged it; "text": the two share most of their words. */
	source: "ai" | "text";
	reason: string;
	/** Share of words in common, from 0 to 1. */
	score: number | null;
	issue: {
		number: number;
		title: string;
		status: string;
		type: "bug" | "feature";
	};
	createdAt: string;
};
