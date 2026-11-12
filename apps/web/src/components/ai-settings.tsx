import { useRouter } from "@tanstack/react-router";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	removeAiSettingsFn,
	saveAiSettingsFn,
	testAiSettingsFn,
} from "#/server/fns";
import {
	AI_PROVIDER_META,
	AI_PROVIDERS,
	type AiProvider,
	type AiSettingsView,
} from "#/shared/ai";

/** The workspace's own AI key, used to judge duplicate candidates. */
export function AiSettingsForm({
	organizationId,
	settings,
}: {
	organizationId: string;
	settings: AiSettingsView;
}) {
	const router = useRouter();
	const [provider, setProvider] = useState<AiProvider>(settings.provider);
	const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
	const [model, setModel] = useState(settings.model);
	const [apiKey, setApiKey] = useState("");
	const [enabled, setEnabled] = useState(settings.enabled);
	const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
	const [tested, setTested] = useState<
		{ ok: true } | { ok: false; error: string } | null
	>(null);

	// After saving or removing, show what the server kept.
	useEffect(() => {
		setProvider(settings.provider);
		setBaseUrl(settings.baseUrl);
		setModel(settings.model);
		setEnabled(settings.enabled);
		setApiKey("");
	}, [settings]);

	if (!settings.canManage) {
		return (
			<p className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
				{settings.enabled
					? `On: ${AI_PROVIDER_META[settings.provider].label}, ${settings.model}. `
					: "Off: only near-identical wording is suggested. "}
				Only owners and admins can change it.
			</p>
		);
	}

	// The key belongs to the provider it was saved with.
	const savedKey =
		provider === settings.provider &&
		settings.keyLast4 &&
		!settings.keyUnreadable
			? settings.keyLast4
			: null;
	const meta = AI_PROVIDER_META[provider];
	const input = {
		organizationId,
		provider,
		baseUrl: provider === "openai_compatible" ? baseUrl : undefined,
		model,
		apiKey: apiKey || undefined,
	};

	const pick = (next: AiProvider) => {
		// Keep a model the person typed; swap a default for the new default.
		const defaults = AI_PROVIDERS.map((p) => AI_PROVIDER_META[p].defaultModel);
		if (!model.trim() || defaults.includes(model.trim()))
			setModel(AI_PROVIDER_META[next].defaultModel);
		setProvider(next);
		setTested(null);
	};

	return (
		<form
			className="space-y-4 rounded-lg bg-raised p-4"
			onSubmit={async (event) => {
				event.preventDefault();
				setBusy("save");
				try {
					await saveAiSettingsFn({ data: { ...input, enabled } });
					toast.success(
						enabled ? "Duplicate suggestions use your AI" : "Settings saved",
					);
					await router.invalidate();
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Not saved");
				} finally {
					setBusy(null);
				}
			}}
		>
			<label
				htmlFor="ai-enabled"
				className="relative flex items-center gap-2.5"
			>
				<Checkbox
					id="ai-enabled"
					checked={enabled}
					onCheckedChange={(v) => setEnabled(v === true)}
				/>
				Judge duplicates with AI
			</label>

			<fieldset className="space-y-2">
				<legend className="mb-2">Provider</legend>
				<div className="flex w-fit flex-wrap rounded-md border border-control p-0.5">
					{AI_PROVIDERS.map((p) => (
						<button
							key={p}
							type="button"
							aria-pressed={provider === p}
							onClick={() => pick(p)}
							className={
								provider === p
									? "rounded bg-active px-3 py-1 font-medium"
									: "rounded px-3 py-1 text-muted-foreground hover:text-ink"
							}
						>
							{AI_PROVIDER_META[p].label}
						</button>
					))}
				</div>
			</fieldset>

			{provider === "openai_compatible" && (
				<div className="space-y-2">
					<Label htmlFor="ai-base-url">Base URL</Label>
					<Input
						id="ai-base-url"
						type="url"
						required
						value={baseUrl}
						onChange={(e) => setBaseUrl(e.target.value)}
						placeholder="https://api.mistral.ai/v1"
					/>
					<p className="text-muted-foreground">
						The address before{" "}
						<span className="font-mono text-xs">/chat/completions</span>, e.g.
						https://openrouter.ai/api/v1. Addresses on the server's own machine
						or private network, like http://localhost:11434/v1 for Ollama, need{" "}
						<span className="font-mono text-xs">
							AI_ALLOW_PRIVATE_URLS=true
						</span>{" "}
						on the server.
					</p>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="ai-model">Model</Label>
					<Input
						id="ai-model"
						value={model}
						onChange={(e) => setModel(e.target.value)}
						placeholder={meta.defaultModel || "mistral-small-latest"}
						required={!meta.defaultModel}
						autoComplete="off"
						spellCheck={false}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="ai-key">API key</Label>
					<Input
						id="ai-key"
						type="password"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder={savedKey ? `Saved: ••••${savedKey}` : "Paste the key"}
						autoComplete="off"
						spellCheck={false}
					/>
				</div>
			</div>
			<p className="text-muted-foreground">
				{meta.keyHelp} It is stored encrypted and never shown again.
				{savedKey && " Leave the field empty to keep the saved key."}
			</p>
			{settings.keyUnreadable && provider === settings.provider && (
				<p className="flex items-start gap-2 rounded-md bg-pill-warning px-3 py-2 text-pill-warning-ink">
					<TriangleAlertIcon className="mt-0.5 size-4 flex-none" />
					The saved key can no longer be read: the server secret changed. Paste
					it again.
				</p>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" disabled={busy !== null}>
					Save
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={busy !== null}
					onClick={async () => {
						setBusy("test");
						setTested(null);
						try {
							setTested(await testAiSettingsFn({ data: input }));
						} catch (error) {
							setTested({
								ok: false,
								error: error instanceof Error ? error.message : "Test failed",
							});
						} finally {
							setBusy(null);
						}
					}}
				>
					{busy === "test" ? "Testing…" : "Test"}
				</Button>
				{settings.configured && (
					<Button
						type="button"
						variant="ghost"
						className="text-muted-foreground"
						disabled={busy !== null}
						onClick={async () => {
							setBusy("remove");
							try {
								await removeAiSettingsFn({ data: { organizationId } });
								setTested(null);
								toast.success("AI settings and key removed");
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error ? error.message : "Not removed",
								);
							} finally {
								setBusy(null);
							}
						}}
					>
						Remove key
					</Button>
				)}
			</div>
			{tested && (
				<output
					className={
						tested.ok
							? "flex items-start gap-2 text-state-done"
							: "flex items-start gap-2 text-negative"
					}
				>
					{tested.ok ? (
						<>
							<CheckIcon className="mt-0.5 size-4 flex-none" />
							{model || meta.defaultModel} answered.
						</>
					) : (
						<>
							<TriangleAlertIcon className="mt-0.5 size-4 flex-none" />
							<span className="min-w-0 break-words">{tested.error}</span>
						</>
					)}
				</output>
			)}
		</form>
	);
}
