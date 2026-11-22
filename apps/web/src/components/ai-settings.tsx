import { useRouter } from "@tanstack/react-router";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
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
	const { m } = useI18n();
	const t = m.workspace.ai;
	const providerLabel = (p: AiProvider) =>
		p === "openai_compatible" ? t.openaiCompatible : AI_PROVIDER_META[p].label;
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
					? t.on(providerLabel(settings.provider), settings.model)
					: t.off}
				{t.onlyAdmins}
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
					toast.success(enabled ? t.usesYourAi : t.settingsSaved);
					await router.invalidate();
				} catch (error) {
					toast.error(
						error instanceof Error ? error.message : m.common.errors.notSaved,
					);
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
				{t.judge}
			</label>

			<fieldset className="space-y-2">
				<legend className="mb-2">{t.provider}</legend>
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
							{providerLabel(p)}
						</button>
					))}
				</div>
			</fieldset>

			{provider === "openai_compatible" && (
				<div className="space-y-2">
					<Label htmlFor="ai-base-url">{t.baseUrl}</Label>
					<Input
						id="ai-base-url"
						type="url"
						required
						value={baseUrl}
						onChange={(e) => setBaseUrl(e.target.value)}
						placeholder="https://api.mistral.ai/v1"
					/>
					<p className="text-muted-foreground">
						{t.baseUrlBefore}{" "}
						<span className="font-mono text-xs">/chat/completions</span>
						{t.baseUrlHelp}{" "}
						<span className="font-mono text-xs">ALLOW_PRIVATE_URLS=true</span>{" "}
						{t.baseUrlAfter}
					</p>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="ai-model">{t.model}</Label>
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
					<Label htmlFor="ai-key">{t.apiKey}</Label>
					<Input
						id="ai-key"
						type="password"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder={savedKey ? t.savedKey(savedKey) : t.pasteKey}
						autoComplete="off"
						spellCheck={false}
					/>
				</div>
			</div>
			<p className="text-muted-foreground">
				{t.keyHelp[provider]} {t.storedEncrypted}
				{savedKey && t.keepSavedKey}
			</p>
			{settings.keyUnreadable && provider === settings.provider && (
				<p className="flex items-start gap-2 rounded-md bg-pill-warning px-3 py-2 text-pill-warning-ink">
					<TriangleAlertIcon className="mt-0.5 size-4 flex-none" />
					{t.keyUnreadable}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" disabled={busy !== null}>
					{m.common.actions.save}
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
								error: error instanceof Error ? error.message : t.testFailed,
							});
						} finally {
							setBusy(null);
						}
					}}
				>
					{busy === "test" ? t.testing : t.test}
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
								toast.success(t.removed);
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error ? error.message : t.notRemoved,
								);
							} finally {
								setBusy(null);
							}
						}}
					>
						{t.removeKey}
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
							{t.answered(model || meta.defaultModel)}
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
