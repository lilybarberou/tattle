import {
	createFileRoute,
	getRouteApi,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { RefreshCwIcon, SendIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CodeBlock } from "#/components/code-block";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { RelativeTime } from "#/components/time";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { LOCALE_NAMES, LOCALES, type Locale } from "#/i18n/locales";
import { useI18n } from "#/i18n/react";
import { cn } from "#/lib/utils";
import {
	createWebhookFn,
	deleteProjectFn,
	deleteWebhookFn,
	getGithubSettingsFn,
	getIdentitySettingsFn,
	listWebhooksFn,
	pingWebhookFn,
	regenerateGithubSecretFn,
	setGithubEnabledFn,
	setIdentityVerificationFn,
	updateProjectFn,
} from "#/server/fns";
import type { WebhookEvent } from "#/shared/issues";
import { PORTAL_SLUG_PATTERN } from "#/shared/portal-slug";

const projectRoute = getRouteApi("/_app/p/$projectId");
const appRoute = getRouteApi("/_app");

export const Route = createFileRoute("/_app/p/$projectId/settings")({
	loader: async ({ params }) => {
		const [webhooks, github, identity] = await Promise.all([
			listWebhooksFn({ data: { projectId: params.projectId } }),
			getGithubSettingsFn({ data: { projectId: params.projectId } }),
			getIdentitySettingsFn({ data: { projectId: params.projectId } }),
		]);
		return { webhooks, github, identity };
	},
	component: SettingsPage,
});

type InstallTab = "web" | "api";
const INSTALL_TABS = [
	{ id: "web", label: "tabWeb" },
	{ id: "api", label: "tabApi" },
] as const satisfies ReadonlyArray<{ id: InstallTab; label: string }>;

function SettingsPage() {
	const project = projectRoute.useLoaderData();
	const { baseUrl } = appRoute.useLoaderData();
	const { webhooks, github, identity } = Route.useLoaderData();
	const router = useRouter();
	const [name, setName] = useState(project.name);
	const [origins, setOrigins] = useState(project.allowedOrigins.join("\n"));
	const [installTab, setInstallTab] = useState<InstallTab>("web");
	const [events, setEvents] = useState<WebhookEvent[]>([]);
	const [chatService, setChatService] = useState<"discord" | "slack">(
		"discord",
	);
	const chatEndpoints = webhooks.endpoints.filter((e) => e.format !== "json");
	const [portalEnabled, setPortalEnabled] = useState(project.portalEnabled);
	const [portalSlug, setPortalSlug] = useState(
		project.portalSlug ?? project.slug,
	);
	const [confirmName, setConfirmName] = useState("");
	const navigate = useNavigate();
	const { m } = useI18n();
	const t = m.settings;

	const save = async (data: {
		name?: string;
		allowedOrigins?: string[];
		portalEnabled?: boolean;
		portalSlug?: string;
		chatLocale?: Locale;
	}) => {
		try {
			await updateProjectFn({ data: { projectId: project.id, ...data } });
			toast.success(m.common.actions.saved);
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : m.common.errors.couldNotSave,
			);
		}
	};

	const setIdentityVerification = async (enabled: boolean, done: string) => {
		try {
			await setIdentityVerificationFn({
				data: { projectId: project.id, enabled },
			});
			toast.success(done);
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : m.common.errors.couldNotSave,
			);
		}
	};

	const identityServerSnippet = `import { createHmac } from "node:crypto";

// ${t.identity.serverComment}
const tattleHash = createHmac("sha256", process.env.TATTLE_IDENTITY_SECRET)
  .update(String(user.id))
  .digest("hex");`;
	const identityClientSnippet = `Tattle.identify({ id: user.id, email: user.email, name: user.name, hash: tattleHash })`;

	const scriptSnippet = `<script
  src="${baseUrl}/widget.js"
  data-project-key="${project.publicKey}"
  data-release="1.4.2"
  defer
></script>`;
	const identifySnippet = `// ${t.install.identifyComment}
Tattle.identify({ id: user.id, email: user.email, name: user.name, plan: user.plan })`;
	const curlSnippet = `curl ${baseUrl}/api/v1/ingest \\
  -H "content-type: application/json" \\
  -d '{
    "projectKey": "${project.publicKey}",
    "type": "bug",
    "message": "The checkout button does nothing",
    "pageUrl": "Checkout",
    "device": { "platform": "ios", "os": { "name": "iOS", "version": "18.2" } },
    "console": [],
    "network": []
  }'`;

	return (
		<>
			<PageHeader
				title={t.title}
				description={t.description(project.name, project.publicKey)}
			/>
			<div className="px-6 pb-10">
				<SettingsSection
					id="general"
					title={t.general.title}
					description={t.general.description}
				>
					<form
						className="flex max-w-md items-end gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void save({ name });
						}}
					>
						<div className="flex-1 space-y-2">
							<Label htmlFor="project-name">{t.general.name}</Label>
							<Input
								id="project-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
								maxLength={80}
								readOnly={!project.canManage}
							/>
						</div>
						{project.canManage && (
							<Button
								type="submit"
								variant="outline"
								disabled={!name.trim() || name === project.name}
							>
								{m.common.actions.save}
							</Button>
						)}
					</form>
					{!project.canManage && <OwnersAndAdminsOnly />}
				</SettingsSection>

				<SettingsSection
					id="install"
					title={t.install.title}
					description={
						<>
							<p>{t.install.description1}</p>
							<p className="mt-2">{t.install.description2}</p>
						</>
					}
				>
					<div
						role="tablist"
						aria-label={t.install.platform}
						className="flex gap-5 border-b"
					>
						{INSTALL_TABS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={installTab === tab.id}
								onClick={() => setInstallTab(tab.id)}
								className={cn(
									"-mb-px h-9 border-b-2 border-transparent text-muted-foreground hover:text-ink",
									installTab === tab.id && "border-brand font-medium text-ink",
								)}
							>
								{t.install[tab.label]}
							</button>
						))}
					</div>
					{installTab === "web" && (
						<>
							<CodeBlock code={scriptSnippet} />
							<p className="text-muted-foreground">
								{t.install.releaseBefore}{" "}
								<code className="font-mono text-xs">data-release</code>{" "}
								{t.install.releaseAfter}
							</p>
							<CodeBlock label={t.install.identify} code={identifySnippet} />
						</>
					)}
					{installTab === "api" && (
						<>
							<p className="text-muted-foreground">
								{t.install.apiBefore}{" "}
								<a
									href="https://github.com/lilybarberou/tattle/blob/main/docs/INGEST-API.md"
									target="_blank"
									rel="noreferrer"
									className="text-ink underline underline-offset-2"
								>
									{t.install.apiLink}
								</a>{" "}
								{t.install.apiAfter}
							</p>
							<CodeBlock code={curlSnippet} />
						</>
					)}
				</SettingsSection>

				<SettingsSection
					id="origins"
					title={t.origins.title}
					description={
						project.allowedOrigins.length === 0 ? (
							<p className="rounded-md bg-pill-warning px-3 py-2 text-pill-warning-ink">
								{t.origins.anySite}
							</p>
						) : (
							<>
								<p>{t.origins.onlyThese}</p>
								<p className="mt-2">{t.origins.mobile}</p>
							</>
						)
					}
				>
					<form
						className="space-y-3"
						onSubmit={(e) => {
							e.preventDefault();
							void save({ allowedOrigins: origins.split("\n") });
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="origins">{t.origins.label}</Label>
							<Textarea
								id="origins"
								value={origins}
								onChange={(e) => setOrigins(e.target.value)}
								rows={3}
								placeholder="https://shop.atelier-nord.fr"
								className="font-mono text-xs"
								readOnly={!project.canManage}
							/>
						</div>
						{project.canManage ? (
							<Button type="submit" variant="outline">
								{t.origins.save}
							</Button>
						) : (
							<OwnersAndAdminsOnly />
						)}
					</form>
				</SettingsSection>

				<SettingsSection
					id="identity"
					title={t.identity.title}
					description={
						<>
							<p>{t.identity.description1}</p>
							<p className="mt-2">{t.identity.description2}</p>
							<p className="mt-2">{t.identity.description3}</p>
						</>
					}
				>
					{identity.secret ? (
						<>
							<CodeBlock label={t.identity.secret} code={identity.secret} />
							<CodeBlock
								label={t.identity.server}
								code={identityServerSnippet}
							/>
							<p className="text-muted-foreground">
								{t.identity.otherLanguage}{" "}
								<code className="font-mono text-xs">
									hash_hmac('sha256', $userId, $secret)
								</code>
								.
							</p>
							<CodeBlock
								label={t.identity.client}
								code={identityClientSnippet}
							/>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									onClick={() =>
										setIdentityVerification(true, t.identity.replaced)
									}
								>
									{t.identity.replace}
								</Button>
								<Button
									variant="ghost"
									onClick={() =>
										setIdentityVerification(false, t.identity.turnedOff)
									}
								>
									{t.identity.turnOff}
								</Button>
							</div>
						</>
					) : identity.canManage ? (
						<Button
							variant="outline"
							onClick={() => setIdentityVerification(true, t.identity.turnedOn)}
						>
							{t.identity.turnOn}
						</Button>
					) : (
						<p className="text-muted-foreground">
							{t.identity.state(identity.enabled)}
						</p>
					)}
				</SettingsSection>

				<SettingsSection
					id="notifications"
					title={t.chat.title}
					description={
						<>
							<p>{t.chat.description1}</p>
							<p className="mt-2">{t.chat.description2}</p>
						</>
					}
				>
					<div className="space-y-2">
						<Label htmlFor="chat-locale">{t.chat.language}</Label>
						<Select
							value={project.chatLocale}
							disabled={!project.canManage}
							onValueChange={(value) => {
								if (value !== project.chatLocale)
									void save({ chatLocale: value as Locale });
							}}
						>
							<SelectTrigger id="chat-locale" className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{LOCALES.map((locale) => (
									<SelectItem key={locale} value={locale} lang={locale}>
										{LOCALE_NAMES[locale]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground">{t.chat.languageHelp}</p>
					</div>
					{chatEndpoints.map((endpoint) => (
						<div
							key={endpoint.id}
							className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
						>
							<span className="rounded-md bg-raised px-2 py-0.5 text-xs font-medium">
								{endpoint.format === "discord" ? "Discord" : "Slack"}
							</span>
							<p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
								{endpoint.url.replace(/(\/[^/]{6})[^/]*$/, "$1…")}
							</p>
							<Button
								size="sm"
								variant="outline"
								onClick={async () => {
									const result = await pingWebhookFn({
										data: { projectId: project.id, endpointId: endpoint.id },
									});
									if (result.ok) toast.success(t.chat.testSent);
									else toast.error(t.chat.testFailed(String(result.error)));
								}}
							>
								<SendIcon className="size-3.5" />
								{t.chat.sendTest}
							</Button>
							{webhooks.canManage && (
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={t.chat.remove}
									onClick={async () => {
										await deleteWebhookFn({
											data: { projectId: project.id, endpointId: endpoint.id },
										});
										toast.success(t.chat.removed);
										await router.invalidate();
									}}
								>
									<Trash2Icon className="size-4" />
								</Button>
							)}
						</div>
					))}
					{!webhooks.canManage && (
						<p className="text-muted-foreground">{t.chat.ownersOnly}</p>
					)}
					{webhooks.canManage && (
						<form
							className="space-y-3 rounded-lg bg-raised p-4"
							onSubmit={async (event) => {
								event.preventDefault();
								const form = event.currentTarget;
								const url = String(new FormData(form).get("chat-url"));
								try {
									await createWebhookFn({
										data: {
											projectId: project.id,
											url,
											format: chatService,
											events: [
												"report.created",
												"issue.created",
												"issue.updated",
												"comment.created",
												"message.created",
											],
										},
									});
									form.reset();
									toast.success(
										t.chat.added(
											chatService === "discord" ? "Discord" : "Slack",
										),
									);
									await router.invalidate();
								} catch (error) {
									toast.error(
										error instanceof Error ? error.message : t.chat.addFailed,
									);
								}
							}}
						>
							<div className="flex rounded-md border border-control bg-surface p-0.5 w-fit">
								{(["discord", "slack"] as const).map((service) => (
									<button
										key={service}
										type="button"
										aria-pressed={chatService === service}
										onClick={() => setChatService(service)}
										className={cn(
											"rounded px-3 py-1 text-muted-foreground hover:text-ink",
											chatService === service &&
												"bg-active font-medium text-ink",
										)}
									>
										{service === "discord" ? "Discord" : "Slack"}
									</button>
								))}
							</div>
							<div className="space-y-2">
								<Label htmlFor="chat-url">{t.chat.url}</Label>
								<Input
									id="chat-url"
									name="chat-url"
									type="url"
									required
									placeholder={
										chatService === "discord"
											? "https://discord.com/api/webhooks/…"
											: "https://hooks.slack.com/services/…"
									}
								/>
							</div>
							<Button type="submit">{t.chat.add}</Button>
						</form>
					)}
				</SettingsSection>

				<SettingsSection
					id="webhooks"
					title={t.webhooks.title}
					description={
						<>
							<p>{t.webhooks.description1}</p>
							<p className="mt-2">
								{t.webhooks.checkBefore}{" "}
								<code className="font-mono text-xs">x-tattle-signature</code>{" "}
								{t.webhooks.checkMiddle}{" "}
								<code className="font-mono text-xs">{"<t>.<body>"}</code>{" "}
								{t.webhooks.checkAfter}
							</p>
						</>
					}
				>
					{webhooks.endpoints
						.filter((endpoint) => endpoint.format === "json")
						.map((endpoint) => (
							<div
								key={endpoint.id}
								className="space-y-3 rounded-lg border p-4"
							>
								<div className="flex flex-wrap items-center gap-2">
									<p className="min-w-0 flex-1 truncate font-mono text-xs">
										{endpoint.url}
									</p>
									<Button
										size="sm"
										variant="outline"
										onClick={async () => {
											const result = await pingWebhookFn({
												data: {
													projectId: project.id,
													endpointId: endpoint.id,
												},
											});
											if (result.ok)
												toast.success(
													t.webhooks.pingDelivered(Number(result.status)),
												);
											else
												toast.error(
													t.webhooks.pingFailed(String(result.error)),
												);
										}}
									>
										<SendIcon className="size-3.5" />
										{t.chat.sendTest}
									</Button>
									{webhooks.canManage && (
										<Button
											size="icon-sm"
											variant="ghost"
											aria-label={t.webhooks.delete}
											onClick={async () => {
												await deleteWebhookFn({
													data: {
														projectId: project.id,
														endpointId: endpoint.id,
													},
												});
												toast.success(t.webhooks.deleted);
												await router.invalidate();
											}}
										>
											<Trash2Icon className="size-4" />
										</Button>
									)}
								</div>
								<p className="text-muted-foreground">
									{endpoint.events.length
										? endpoint.events.join(", ")
										: t.webhooks.everyEvent}
								</p>
								{endpoint.secret && (
									<CodeBlock
										label={t.webhooks.signingSecret}
										code={endpoint.secret}
									/>
								)}
							</div>
						))}

					{!webhooks.canManage && (
						<p className="text-muted-foreground">{t.webhooks.ownersOnly}</p>
					)}
					{webhooks.canManage && (
						<form
							className="space-y-4 rounded-lg bg-raised p-4"
							onSubmit={async (event) => {
								event.preventDefault();
								const form = event.currentTarget;
								const url = String(new FormData(form).get("url"));
								try {
									await createWebhookFn({
										data: {
											projectId: project.id,
											url,
											events,
											format: "json",
										},
									});
									form.reset();
									setEvents([]);
									toast.success(t.webhooks.added);
									await router.invalidate();
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: t.webhooks.addFailed,
									);
								}
							}}
						>
							<div className="space-y-2">
								<Label htmlFor="webhook-url">{t.webhooks.endpoint}</Label>
								<Input
									id="webhook-url"
									name="url"
									type="url"
									required
									placeholder="https://bot.atelier-nord.fr/hooks/tattle"
								/>
							</div>
							<fieldset className="space-y-2">
								<legend className="mb-2 text-muted-foreground">
									{t.webhooks.events}
								</legend>
								{webhooks.events.map((event) => (
									<label
										key={event}
										htmlFor={`event-${event}`}
										className="relative flex items-start gap-2.5"
									>
										<Checkbox
											id={`event-${event}`}
											className="mt-0.5"
											checked={events.includes(event)}
											onCheckedChange={(checked) =>
												setEvents(
													checked
														? [...events, event]
														: events.filter((e) => e !== event),
												)
											}
										/>
										<span>
											<span className="font-mono text-xs">{event}</span>
											<span className="block text-muted-foreground">
												{t.webhooks.eventHelp[event as WebhookEvent]}
											</span>
										</span>
									</label>
								))}
							</fieldset>
							<Button type="submit">{t.webhooks.add}</Button>
						</form>
					)}

					{webhooks.deliveries.length > 0 && (
						<div>
							<h3 className="mb-2 font-medium">{t.webhooks.recent}</h3>
							<table className="w-full">
								<thead className="text-left text-xs text-muted-foreground">
									<tr>
										<th className="pb-2 font-normal">{t.webhooks.event}</th>
										<th className="pb-2 font-normal">{t.webhooks.result}</th>
										<th className="pb-2 text-right font-normal">
											{t.webhooks.tries}
										</th>
										<th className="pb-2 text-right font-normal">
											{t.webhooks.when}
										</th>
									</tr>
								</thead>
								<tbody>
									{webhooks.deliveries.map((d) => (
										<tr key={d.id} className="border-t border-rule">
											<td className="py-2 font-mono text-xs">{d.event}</td>
											<td className="py-2">
												<span
													className={cn(
														"inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
														d.status === "success" &&
															"bg-pill-positive text-pill-positive-ink",
														d.status === "failed" &&
															"bg-pill-negative text-pill-negative-ink",
														d.status === "pending" &&
															"bg-pill-neutral text-pill-neutral-ink",
													)}
												>
													{d.status === "success"
														? `${t.webhooks.delivered}${d.responseStatus ? ` · ${d.responseStatus}` : ""}`
														: d.status === "failed"
															? `${t.webhooks.failed}${d.lastError ? ` · ${d.lastError}` : ""}`
															: t.webhooks.retrying}
												</span>
											</td>
											<td className="num py-2 text-right">{d.attempts}</td>
											<td className="py-2 text-right text-muted-foreground">
												<RelativeTime iso={d.createdAt} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</SettingsSection>

				<SettingsSection
					id="github"
					title={t.github.title}
					description={
						<>
							<p>{t.github.description1}</p>
							<p className="mt-2">
								{t.github.linkedBefore}{" "}
								<code className="font-mono text-xs">update_issue</code>
								{t.github.linkedMiddle}{" "}
								<code className="font-mono text-xs">Fixes Tattle #12</code>{" "}
								{t.github.linkedOr}{" "}
								<code className="font-mono text-xs">closes tattle#12</code>
								{t.github.linkedAfter}
							</p>
						</>
					}
				>
					<GithubSettings
						projectId={project.id}
						hookUrl={`${baseUrl}/api/v1/github/${project.id}`}
						settings={github}
					/>
				</SettingsSection>

				<SettingsSection
					id="portal"
					title={t.portal.title}
					description={t.portal.description}
				>
					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void save({ portalEnabled, portalSlug });
						}}
					>
						<label
							htmlFor="portal-enabled"
							className="relative flex items-center gap-2.5"
						>
							<Checkbox
								id="portal-enabled"
								checked={portalEnabled}
								onCheckedChange={(v) => setPortalEnabled(v === true)}
								disabled={!project.canManage}
							/>
							{t.portal.publish}
						</label>
						<div className="space-y-2">
							<Label htmlFor="portal-slug">{t.portal.address}</Label>
							<div className="flex max-w-lg items-center rounded-md border border-input bg-surface transition-[color,box-shadow] has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50">
								<span className="truncate pl-3 text-muted-foreground">
									{baseUrl.replace(/^https?:\/\//, "")}/portal/
								</span>
								<input
									id="portal-slug"
									value={portalSlug}
									onChange={(e) => setPortalSlug(e.target.value.toLowerCase())}
									className="h-8 min-w-0 flex-1 bg-transparent pr-3 outline-none"
									pattern={PORTAL_SLUG_PATTERN}
									required
									readOnly={!project.canManage}
								/>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							{project.canManage ? (
								<Button type="submit" variant="outline">
									{m.common.actions.save}
								</Button>
							) : (
								<OwnersAndAdminsOnly />
							)}
							{project.portalEnabled && project.portalSlug && (
								<Link
									to="/portal/$slug"
									params={{ slug: project.portalSlug }}
									target="_blank"
									className="font-medium text-brand hover:underline"
								>
									{t.portal.open}
								</Link>
							)}
						</div>
					</form>
				</SettingsSection>

				{project.canManage && (
					<SettingsSection
						id="danger"
						title={t.danger.title}
						description={t.danger.description}
					>
						<form
							className="max-w-md space-y-3 rounded-lg border border-negative/30 p-4"
							onSubmit={async (e) => {
								e.preventDefault();
								try {
									await deleteProjectFn({
										data: { projectId: project.id, confirmName },
									});
									toast.success(t.danger.deleted(project.name));
									await router.invalidate();
									await navigate({ to: "/" });
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: m.common.errors.couldNotDelete,
									);
								}
							}}
						>
							<Label htmlFor="confirm-name">
								{t.danger.typeBefore}{" "}
								<span className="font-semibold">{project.name}</span>{" "}
								{t.danger.typeAfter}
							</Label>
							<Input
								id="confirm-name"
								value={confirmName}
								onChange={(e) => setConfirmName(e.target.value)}
								autoComplete="off"
							/>
							<Button
								type="submit"
								variant="destructive"
								disabled={confirmName.trim() !== project.name}
							>
								{t.danger.delete(project.name)}
							</Button>
						</form>
					</SettingsSection>
				)}
			</div>
		</>
	);
}

/** In place of a setting's Save button, for plain members. */
function OwnersAndAdminsOnly() {
	const { m } = useI18n();
	return (
		<p className="text-muted-foreground">{m.settings.ownersAndAdminsOnly}</p>
	);
}

type GithubSettingsData = Awaited<ReturnType<typeof getGithubSettingsFn>>;

function GithubSettings({
	projectId,
	hookUrl,
	settings,
}: {
	projectId: string;
	hookUrl: string;
	settings: GithubSettingsData;
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const { m } = useI18n();
	const t = m.settings.github;

	const act = async (action: () => Promise<unknown>, success: string) => {
		setBusy(true);
		try {
			await action();
			toast.success(success);
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : m.common.errors.couldNotSave,
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="space-y-4">
			<label
				htmlFor="github-enabled"
				className="relative flex items-center gap-2.5"
			>
				<Checkbox
					id="github-enabled"
					checked={settings.enabled}
					disabled={!settings.canManage || busy}
					onCheckedChange={(v) =>
						act(
							() =>
								setGithubEnabledFn({
									data: { projectId, enabled: v === true },
								}),
							v === true ? t.turnedOn : t.turnedOff,
						)
					}
				/>
				{t.toggle}
			</label>
			{!settings.canManage && (
				<p className="text-muted-foreground">
					{m.settings.ownersAndAdminsOnly}
				</p>
			)}
			{settings.canManage && settings.enabled && settings.secret && (
				<>
					<ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
						<li>
							{t.step1} <b>{t.step1Path}</b>.
						</li>
						<li>
							<b>{t.payloadUrl}</b>
							{t.step2}
						</li>
						<li>
							<b>{t.contentType}</b>
							{t.colon}{" "}
							<code className="font-mono text-xs">application/json</code>.
						</li>
						<li>
							<b>{t.secret}</b>
							{t.step4}
						</li>
						<li>
							<b>{t.selectEvents}</b>
							{t.step5Check} <b>{t.pullRequests}</b> {t.step5Then}{" "}
							<b>{t.addWebhook}</b>
							{t.step5Ping}
						</li>
					</ol>
					<CodeBlock label={t.payloadUrl} code={hookUrl} />
					<CodeBlock label={t.secret} code={settings.secret} />
					<div className="flex flex-wrap items-center gap-3">
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() =>
								act(
									() => regenerateGithubSecretFn({ data: { projectId } }),
									t.newSecretCreated,
								)
							}
						>
							<RefreshCwIcon className="size-3.5" />
							{t.newSecret}
						</Button>
						<span className="text-muted-foreground">{t.oldStops}</span>
					</div>
				</>
			)}
			{settings.lastDeliveryAt && (
				<p className="text-muted-foreground">
					{t.lastDelivery} <RelativeTime iso={settings.lastDeliveryAt} />
					{t.colon} {settings.lastDelivery}
				</p>
			)}
		</div>
	);
}
