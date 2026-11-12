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
import { relativeTime } from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import {
	createWebhookFn,
	deleteProjectFn,
	deleteWebhookFn,
	getGithubSettingsFn,
	listWebhooksFn,
	pingWebhookFn,
	regenerateGithubSecretFn,
	setGithubEnabledFn,
	setIdentityVerificationFn,
	updateProjectFn,
} from "#/server/fns";
import type { WebhookEvent } from "#/shared/issues";

const projectRoute = getRouteApi("/_app/p/$projectId");
const appRoute = getRouteApi("/_app");

export const Route = createFileRoute("/_app/p/$projectId/settings")({
	loader: async ({ params }) => {
		const [webhooks, github] = await Promise.all([
			listWebhooksFn({ data: { projectId: params.projectId } }),
			getGithubSettingsFn({ data: { projectId: params.projectId } }),
		]);
		return { webhooks, github };
	},
	component: SettingsPage,
});

const EVENT_HELP: Record<WebhookEvent, string> = {
	"report.created": "A user sent a report from the widget",
	"issue.created": "An issue was opened, from a report or by hand",
	"issue.updated": "Status, priority, labels, assignee or PR changed",
	"comment.created": "Someone, or an agent, commented",
	"message.created":
		"A reporter wrote to the team, or the team replied to a reporter",
};

type InstallTab = "web" | "api";
const INSTALL_TABS: Array<{ id: InstallTab; label: string }> = [
	{ id: "web", label: "Website" },
	{ id: "api", label: "Mobile and other apps (API)" },
];

function SettingsPage() {
	const project = projectRoute.useLoaderData();
	const { baseUrl } = appRoute.useLoaderData();
	const { webhooks, github } = Route.useLoaderData();
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

	const save = async (data: {
		name?: string;
		allowedOrigins?: string[];
		portalEnabled?: boolean;
		portalSlug?: string;
	}) => {
		try {
			await updateProjectFn({ data: { projectId: project.id, ...data } });
			toast.success("Saved");
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not save");
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
			toast.error(error instanceof Error ? error.message : "Could not save");
		}
	};

	const identityServerSnippet = `import { createHmac } from "node:crypto";

// Send it to the page with the rest of the signed-in user's data.
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
	const identifySnippet = `// After sign-in, so every report says who sent it:
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
				title="Project settings"
				description={`${project.name} · public key ${project.publicKey}`}
			/>
			<div className="px-6 pb-10">
				<SettingsSection
					id="general"
					title="General"
					description="The project's name, shown in the sidebar and in webhook payloads."
				>
					<form
						className="flex max-w-md items-end gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void save({ name });
						}}
					>
						<div className="flex-1 space-y-2">
							<Label htmlFor="project-name">Name</Label>
							<Input
								id="project-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
								maxLength={80}
							/>
						</div>
						<Button
							type="submit"
							variant="outline"
							disabled={!name.trim() || name === project.name}
						>
							Save
						</Button>
					</form>
				</SettingsSection>

				<SettingsSection
					id="install"
					title="Install the widget"
					description={
						<>
							<p>
								Adds a button to your app. Users report a bug with an annotated
								screenshot, or suggest an idea.
							</p>
							<p className="mt-2">
								The steps before the report, console errors, failed requests and
								the device are attached automatically.
							</p>
						</>
					}
				>
					<div
						role="tablist"
						aria-label="Platform"
						className="flex gap-5 border-b"
					>
						{INSTALL_TABS.map((t) => (
							<button
								key={t.id}
								type="button"
								role="tab"
								aria-selected={installTab === t.id}
								onClick={() => setInstallTab(t.id)}
								className={cn(
									"-mb-px h-9 border-b-2 border-transparent text-muted-foreground hover:text-ink",
									installTab === t.id && "border-brand font-medium text-ink",
								)}
							>
								{t.label}
							</button>
						))}
					</div>
					{installTab === "web" && (
						<>
							<CodeBlock code={scriptSnippet} />
							<p className="text-muted-foreground">
								Set <code className="font-mono text-xs">data-release</code> to
								your app's version on each deploy: issues show the releases they
								were seen in, and a done bug reported again is reopened as a
								regression.
							</p>
							<CodeBlock
								label="Then identify the signed-in user"
								code={identifySnippet}
							/>
						</>
					)}
					{installTab === "api" && (
						<>
							<p className="text-muted-foreground">
								Swift, Kotlin, Flutter, React Native or a backend: send reports
								with one JSON request. The{" "}
								<a
									href="https://github.com/lilybarberou/tattle/blob/main/docs/INGEST-API.md"
									target="_blank"
									rel="noreferrer"
									className="text-ink underline underline-offset-2"
								>
									ingest API reference
								</a>{" "}
								lists every field.
							</p>
							<CodeBlock code={curlSnippet} />
						</>
					)}
				</SettingsSection>

				<SettingsSection
					id="origins"
					title="Allowed sites"
					description={
						project.allowedOrigins.length === 0 ? (
							<p className="rounded-md bg-pill-warning px-3 py-2 text-pill-warning-ink">
								Any site can send reports with this key. Fine while testing;
								list your app's address before you go live.
							</p>
						) : (
							<>
								<p>Only these sites can send reports with this key.</p>
								<p className="mt-2">
									Mobile apps are not affected: they send no site address.
								</p>
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
							<Label htmlFor="origins">One address per line</Label>
							<Textarea
								id="origins"
								value={origins}
								onChange={(e) => setOrigins(e.target.value)}
								rows={3}
								placeholder="https://shop.atelier-nord.fr"
								className="font-mono text-xs"
							/>
						</div>
						<Button type="submit" variant="outline">
							Save sites
						</Button>
					</form>
				</SettingsSection>

				<SettingsSection
					id="identity"
					title="Verified identity"
					description={
						<>
							<p>
								People follow their reports and talk with you from the widget.
								By default, each device sees the reports sent from it.
							</p>
							<p className="mt-2">
								Turn this on so a signed-in user sees all their reports, on
								every device: your server signs their id with this secret and
								the widget passes the signature along. A user id without a valid
								signature never opens anyone's reports.
							</p>
							<p className="mt-2">
								While it is on, a report sent by a verified user is theirs only:
								the device it came from no longer lists it on its own. Replacing
								the secret breaks every signature made with the old one, so
								until your server signs with the new secret, signed-in users see
								only what their device sent without signing in. Turning it off
								gives each device back every report sent from it, verified or
								not.
							</p>
						</>
					}
				>
					{project.identitySecret ? (
						<>
							<CodeBlock
								label="Identity secret: keep it on your server"
								code={project.identitySecret}
							/>
							<CodeBlock
								label="On your server, for the signed-in user (Node)"
								code={identityServerSnippet}
							/>
							<p className="text-muted-foreground">
								Any other language: the HMAC-SHA256 of the user id with this
								secret, in hex. In PHP,{" "}
								<code className="font-mono text-xs">
									hash_hmac('sha256', $userId, $secret)
								</code>
								.
							</p>
							<CodeBlock
								label="Then in your app, with the same id"
								code={identityClientSnippet}
							/>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									onClick={() =>
										setIdentityVerification(
											true,
											"New secret. Update your server: signatures made with the old one no longer work, and until then signed-in users only see what their device sent without signing in.",
										)
									}
								>
									Replace the secret
								</Button>
								<Button
									variant="ghost"
									onClick={() =>
										setIdentityVerification(
											false,
											"Verified identity is off. Each device sees every report sent from it, verified or not.",
										)
									}
								>
									Turn off
								</Button>
							</div>
						</>
					) : (
						<Button
							variant="outline"
							onClick={() =>
								setIdentityVerification(
									true,
									"Verified identity is on. Add the signature on your server.",
								)
							}
						>
							Turn on verified identity
						</Button>
					)}
				</SettingsSection>

				<SettingsSection
					id="notifications"
					title="Discord and Slack"
					description={
						<>
							<p>
								Posts new reports, status and assignee changes, and comments to
								a channel.
							</p>
							<p className="mt-2">
								Discord: channel settings → Integrations → Webhooks → New
								webhook → Copy URL. Slack: an Incoming Webhook URL.
							</p>
						</>
					}
				>
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
									if (result.ok) toast.success("Test message sent");
									else toast.error(`Test failed: ${result.error}`);
								}}
							>
								<SendIcon className="size-3.5" />
								Send a test
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label="Remove this channel"
								onClick={async () => {
									await deleteWebhookFn({
										data: { projectId: project.id, endpointId: endpoint.id },
									});
									toast.success("Channel removed");
									await router.invalidate();
								}}
							>
								<Trash2Icon className="size-4" />
							</Button>
						</div>
					))}
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
									`${chatService === "discord" ? "Discord" : "Slack"} channel added`,
								);
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: "Could not add the channel",
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
										chatService === service && "bg-active font-medium text-ink",
									)}
								>
									{service === "discord" ? "Discord" : "Slack"}
								</button>
							))}
						</div>
						<div className="space-y-2">
							<Label htmlFor="chat-url">Webhook URL</Label>
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
						<Button type="submit">Add channel</Button>
					</form>
				</SettingsSection>

				<SettingsSection
					id="webhooks"
					title="Webhooks"
					description={
						<>
							<p>
								We POST each event as JSON to your agent or server, and retry 5
								times if it fails.
							</p>
							<p className="mt-2">
								Check the{" "}
								<code className="font-mono text-xs">x-tattle-signature</code>{" "}
								header: an HMAC-SHA256 of{" "}
								<code className="font-mono text-xs">{"<t>.<body>"}</code> with
								the secret.
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
												toast.success(`Ping delivered (HTTP ${result.status})`);
											else toast.error(`Ping failed: ${result.error}`);
										}}
									>
										<SendIcon className="size-3.5" />
										Send a test
									</Button>
									<Button
										size="icon-sm"
										variant="ghost"
										aria-label="Delete this webhook"
										onClick={async () => {
											await deleteWebhookFn({
												data: {
													projectId: project.id,
													endpointId: endpoint.id,
												},
											});
											toast.success("Webhook deleted");
											await router.invalidate();
										}}
									>
										<Trash2Icon className="size-4" />
									</Button>
								</div>
								<p className="text-muted-foreground">
									{endpoint.events.length
										? endpoint.events.join(", ")
										: "Every event"}
								</p>
								<CodeBlock label="Signing secret" code={endpoint.secret} />
							</div>
						))}

					<form
						className="space-y-4 rounded-lg bg-raised p-4"
						onSubmit={async (event) => {
							event.preventDefault();
							const form = event.currentTarget;
							const url = String(new FormData(form).get("url"));
							try {
								await createWebhookFn({
									data: { projectId: project.id, url, events, format: "json" },
								});
								form.reset();
								setEvents([]);
								toast.success("Webhook added");
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: "Could not add the webhook",
								);
							}
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="webhook-url">Add an endpoint</Label>
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
								Events, or none for every event
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
											{EVENT_HELP[event]}
										</span>
									</span>
								</label>
							))}
						</fieldset>
						<Button type="submit">Add webhook</Button>
					</form>

					{webhooks.deliveries.length > 0 && (
						<div>
							<h3 className="mb-2 font-medium">Recent deliveries</h3>
							<table className="w-full">
								<thead className="text-left text-xs text-muted-foreground">
									<tr>
										<th className="pb-2 font-normal">Event</th>
										<th className="pb-2 font-normal">Result</th>
										<th className="pb-2 text-right font-normal">Tries</th>
										<th className="pb-2 text-right font-normal">When</th>
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
														? `Delivered${d.responseStatus ? ` · ${d.responseStatus}` : ""}`
														: d.status === "failed"
															? `Failed${d.lastError ? ` · ${d.lastError}` : ""}`
															: "Retrying"}
												</span>
											</td>
											<td className="num py-2 text-right">{d.attempts}</td>
											<td className="py-2 text-right text-muted-foreground">
												{relativeTime(d.createdAt)}
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
					title="GitHub"
					description={
						<>
							<p>
								Moves an issue to Done when its pull request is merged into the
								repository's default branch, so nobody has to do it by hand.
								Reporters of a shipped feature get their email as usual.
							</p>
							<p className="mt-2">
								A pull request is linked when it is the issue's PR (agents set
								it with <code className="font-mono text-xs">update_issue</code>
								), or when its title or description says{" "}
								<code className="font-mono text-xs">Fixes Tattle #12</code> (or{" "}
								<code className="font-mono text-xs">closes tattle#12</code>:
								fix, close or resolve in any form, right before the reference; a
								bare mention links nothing, and a plain #12 is GitHub's own
								issue). Opening such a pull request links it and moves the issue
								from Todo or In progress to In review. An issue whose pull
								request is another one is left alone.
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
					title="Public feature requests"
					description="A public page where anyone can see what you plan, vote for ideas and suggest new ones. Only requests you accepted from Triage appear there."
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
							/>
							Publish the page
						</label>
						<div className="space-y-2">
							<Label htmlFor="portal-slug">Address</Label>
							<div className="flex max-w-lg items-center rounded-md border border-input bg-surface">
								<span className="truncate pl-3 text-muted-foreground">
									{baseUrl.replace(/^https?:\/\//, "")}/portal/
								</span>
								<input
									id="portal-slug"
									value={portalSlug}
									onChange={(e) => setPortalSlug(e.target.value.toLowerCase())}
									className="h-8 min-w-0 flex-1 bg-transparent pr-3 outline-none"
									pattern="[a-z0-9][a-z0-9-]{2,39}"
									required
								/>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<Button type="submit" variant="outline">
								Save
							</Button>
							{project.portalEnabled && project.portalSlug && (
								<Link
									to="/portal/$slug"
									params={{ slug: project.portalSlug }}
									target="_blank"
									className="font-medium text-brand hover:underline"
								>
									Open the public page
								</Link>
							)}
						</div>
					</form>
				</SettingsSection>

				<SettingsSection
					id="danger"
					title="Delete this project"
					description="Deletes every issue, report, screenshot, webhook and vote of this project. The widget stops accepting reports. This cannot be undone."
				>
					<form
						className="max-w-md space-y-3 rounded-lg border border-negative/30 p-4"
						onSubmit={async (e) => {
							e.preventDefault();
							try {
								await deleteProjectFn({
									data: { projectId: project.id, confirmName },
								});
								toast.success(`${project.name} was deleted`);
								await router.invalidate();
								await navigate({ to: "/" });
							} catch (error) {
								toast.error(
									error instanceof Error ? error.message : "Could not delete",
								);
							}
						}}
					>
						<Label htmlFor="confirm-name">
							Type <span className="font-semibold">{project.name}</span> to
							confirm
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
							Delete {project.name}
						</Button>
					</form>
				</SettingsSection>
			</div>
		</>
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

	const act = async (action: () => Promise<unknown>, success: string) => {
		setBusy(true);
		try {
			await action();
			toast.success(success);
			await router.invalidate();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not save");
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
							v === true ? "GitHub sync turned on" : "GitHub sync turned off",
						)
					}
				/>
				Move issues to Done when their pull request is merged
			</label>
			{!settings.canManage && (
				<p className="text-muted-foreground">
					Only owners and admins can change this.
				</p>
			)}
			{settings.canManage && settings.enabled && settings.secret && (
				<>
					<ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
						<li>
							In your repository on GitHub:{" "}
							<b>Settings → Webhooks → Add webhook</b>.
						</li>
						<li>
							<b>Payload URL</b>: the address below.
						</li>
						<li>
							<b>Content type</b>:{" "}
							<code className="font-mono text-xs">application/json</code>.
						</li>
						<li>
							<b>Secret</b>: the secret below.
						</li>
						<li>
							<b>Let me select individual events</b>, check <b>Pull requests</b>{" "}
							only, then <b>Add webhook</b>. GitHub sends a ping right away.
						</li>
					</ol>
					<CodeBlock label="Payload URL" code={hookUrl} />
					<CodeBlock label="Secret" code={settings.secret} />
					<div className="flex flex-wrap items-center gap-3">
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() =>
								act(
									() => regenerateGithubSecretFn({ data: { projectId } }),
									"New secret created: paste it in GitHub",
								)
							}
						>
							<RefreshCwIcon className="size-3.5" />
							New secret
						</Button>
						<span className="text-muted-foreground">
							The old one stops working at once.
						</span>
					</div>
				</>
			)}
			{settings.lastDeliveryAt && (
				<p className="text-muted-foreground">
					Last delivery {relativeTime(settings.lastDeliveryAt)}:{" "}
					{settings.lastDelivery}
				</p>
			)}
		</div>
	);
}
