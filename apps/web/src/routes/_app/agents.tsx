import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AiSettingsForm } from "#/components/ai-settings";
import { CodeBlock } from "#/components/code-block";
import { Face, relativeTime } from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	createTokenFn,
	getAiSettingsFn,
	getWorkspaceFn,
	listOAuthAppsFn,
	listTokensFn,
	revokeOAuthAppFn,
	revokeTokenFn,
} from "#/server/fns";

export const Route = createFileRoute("/_app/agents")({
	loader: async () => {
		const { organizations, baseUrl } = await getWorkspaceFn();
		const organization = organizations[0];
		if (!organization) throw new Error("No organization");
		const [tokens, apps, ai] = await Promise.all([
			listTokensFn({ data: { organizationId: organization.id } }),
			listOAuthAppsFn(),
			getAiSettingsFn({ data: { organizationId: organization.id } }),
		]);
		return { organization, tokens, apps, baseUrl, ai };
	},
	component: AgentsPage,
});

const TOOLS: Array<[string, string]> = [
	["list_issues", "The Triage queue and every other view"],
	["search_issues", "Find similar issues before merging"],
	[
		"get_issue",
		"An issue with its comments, activity and duplicate suggestion",
	],
	["get_report", "Logs, device, account and the screenshot as an image"],
	["update_issue", "Status, priority, labels, assignee, pull request"],
	["mark_duplicate", "Merge into the original, reports included"],
	["add_comment", "Explain a decision on the issue"],
	["create_issue", "Open an issue it found itself"],
];

function AgentsPage() {
	const { organization, tokens, apps, baseUrl, ai } = Route.useLoaderData();
	const router = useRouter();
	const [created, setCreated] = useState<string | null>(null);
	const [canWrite, setCanWrite] = useState(true);
	const token = created ?? "tat_…";

	return (
		<>
			<PageHeader
				title="Agents & API"
				description={`Tokens work for every project of ${organization.name}. An agent acts under its token's name.`}
			/>
			<div className="px-6 pb-10">
				<SettingsSection
					id="tokens"
					title="Agents"
					description="Each token is an agent you can assign issues to. Assigning one sends it an issue.updated webhook."
				>
					{tokens.length === 0 ? (
						<p className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
							No agent yet. Create a token below to connect one.
						</p>
					) : (
						<ul className="divide-y divide-rule rounded-lg border">
							{tokens.map((t) => (
								<li
									key={t.id}
									className="flex flex-wrap items-center gap-3 px-4 py-3"
								>
									<Face name={t.name} kind="agent" size={28} />
									<div className="min-w-0 flex-1">
										<p className="font-medium">{t.name}</p>
										<p className="text-muted-foreground">
											<span className="font-mono text-xs">{t.prefix}…</span> ·{" "}
											{t.canWrite ? "Reads and changes issues" : "Read only"} ·{" "}
											{t.lastUsedAt
												? `active ${relativeTime(t.lastUsedAt)}`
												: "never used"}
										</p>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={async () => {
											await revokeTokenFn({
												data: {
													organizationId: organization.id,
													tokenId: t.id,
												},
											});
											toast.success(`${t.name} can no longer connect`);
											await router.invalidate();
										}}
									>
										Revoke
									</Button>
								</li>
							))}
						</ul>
					)}

					<form
						className="space-y-4 rounded-lg bg-raised p-4"
						onSubmit={async (event) => {
							event.preventDefault();
							const form = event.currentTarget;
							try {
								const result = await createTokenFn({
									data: {
										organizationId: organization.id,
										name: String(new FormData(form).get("name")),
										canWrite,
									},
								});
								setCreated(result.token);
								form.reset();
								await router.invalidate();
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: "Could not create the token",
								);
							}
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="token-name">New agent</Label>
							<Input
								id="token-name"
								name="name"
								required
								maxLength={60}
								placeholder="Triage bot"
							/>
						</div>
						<label
							htmlFor="token-write"
							className="relative flex items-center gap-2.5"
						>
							<Checkbox
								id="token-write"
								checked={canWrite}
								onCheckedChange={(v) => setCanWrite(v === true)}
							/>
							Can change issues (otherwise read only)
						</label>
						<Button type="submit">Create token</Button>
					</form>

					{created && (
						<div className="space-y-2 rounded-lg border border-state-triage/40 bg-pill-warning p-4">
							<p className="font-medium text-pill-warning-ink">
								Copy this token now. It is shown only once.
							</p>
							<CodeBlock code={created} />
						</div>
					)}
				</SettingsSection>

				<SettingsSection
					id="connect-oauth"
					title="Connect your own MCP client"
					description="Claude Code, Cursor and other MCP clients sign you in through the browser: no token to copy. They act as you."
				>
					<CodeBlock
						label="Claude Code"
						code={`claude mcp add --transport http tattle ${baseUrl}/api/mcp`}
					/>
					{apps.length === 0 ? (
						<p className="text-muted-foreground">
							No app connected with your account yet.
						</p>
					) : (
						<ul className="divide-y divide-rule rounded-lg border">
							{apps.map((app) => (
								<li
									key={app.clientId}
									className="flex flex-wrap items-center gap-3 px-4 py-3"
								>
									<Face name={app.name ?? "App"} kind="agent" size={28} />
									<div className="min-w-0 flex-1">
										<p className="font-medium">{app.name ?? "Unnamed app"}</p>
										<p className="text-muted-foreground">
											Connected {relativeTime(app.connectedAt)}
											{app.uri ? ` · ${app.uri}` : ""}
										</p>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={async () => {
											await revokeOAuthAppFn({
												data: { clientId: app.clientId },
											});
											toast.success(
												`${app.name ?? "The app"} was disconnected`,
											);
											await router.invalidate();
										}}
									>
										Disconnect
									</Button>
								</li>
							))}
						</ul>
					)}
				</SettingsSection>

				<SettingsSection
					id="connect"
					title="Connect an agent with a token"
					description="For bots and scripts that run without a browser. Paste one of these where the agent reads its MCP servers."
				>
					<CodeBlock
						label="Claude Code"
						code={`claude mcp add --transport http tattle ${baseUrl}/api/mcp \\\n  --header "Authorization: Bearer ${token}"`}
					/>
					<CodeBlock
						label="Any MCP client"
						code={JSON.stringify(
							{
								mcpServers: {
									tattle: {
										type: "http",
										url: `${baseUrl}/api/mcp`,
										headers: { Authorization: `Bearer ${token}` },
									},
								},
							},
							null,
							2,
						)}
					/>
				</SettingsSection>

				<SettingsSection
					id="duplicates"
					title="Duplicate suggestions"
					description={
						<>
							<p>
								Each new report is compared with the project's most similar
								issues. Without AI, only a near-identical wording is suggested.
							</p>
							<p className="mt-2">
								With your own key, the model judges whether they describe the
								same problem. It receives the report's message, page URL and
								console errors, and the title and description of up to 8 similar
								issues. Nothing is sent while this is off.
							</p>
						</>
					}
				>
					<AiSettingsForm organizationId={organization.id} settings={ai} />
				</SettingsSection>

				<SettingsSection
					id="tools"
					title="What an agent can do"
					description="Report text is written by your users. The server tells agents to treat it as data, never as instructions."
				>
					<dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
						{TOOLS.map(([tool, help]) => (
							<div key={tool} className="contents">
								<dt className="font-mono text-xs leading-5">{tool}</dt>
								<dd className="text-muted-foreground">{help}</dd>
							</div>
						))}
					</dl>
				</SettingsSection>
			</div>
		</>
	);
}
