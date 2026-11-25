import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AiSettingsForm } from "#/components/ai-settings";
import { CodeBlock } from "#/components/code-block";
import { Face } from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { RelativeTime } from "#/components/time";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
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

const TOOLS = [
	"list_issues",
	"search_issues",
	"get_issue",
	"get_report",
	"update_issue",
	"mark_duplicate",
	"add_comment",
	"create_issue",
] as const;

function AgentsPage() {
	const { organization, tokens, apps, baseUrl, ai } = Route.useLoaderData();
	const router = useRouter();
	const { m } = useI18n();
	const a = m.workspace.agents;
	const [created, setCreated] = useState<string | null>(null);
	const [canWrite, setCanWrite] = useState(true);
	const token = created ?? "tat_…";

	return (
		<>
			<PageHeader
				title={a.title}
				description={a.description(organization.name)}
			/>
			<div className="px-6 pb-10">
				<SettingsSection
					id="tokens"
					title={a.agentsTitle}
					description={a.agentsDescription}
				>
					{tokens.length === 0 ? (
						<p className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
							{a.noAgent}
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
											{t.canWrite ? a.readsAndChanges : a.readOnly} ·{" "}
											{t.lastUsedAt ? (
												<>
													{a.active} <RelativeTime iso={t.lastUsedAt} />
												</>
											) : (
												a.neverUsed
											)}
										</p>
									</div>
									{t.canRevoke && (
										<Button
											variant="outline"
											size="sm"
											onClick={async () => {
												try {
													await revokeTokenFn({
														data: {
															organizationId: organization.id,
															tokenId: t.id,
														},
													});
													toast.success(a.revoked(t.name));
													await router.invalidate();
												} catch (error) {
													toast.error(
														error instanceof Error
															? error.message
															: a.notRevoked,
													);
												}
											}}
										>
											{a.revoke}
										</Button>
									)}
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
									error instanceof Error ? error.message : a.createFailed,
								);
							}
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="token-name">{a.newAgent}</Label>
							<Input
								id="token-name"
								name="name"
								required
								maxLength={60}
								placeholder={a.namePlaceholder}
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
							{a.canWrite}
						</label>
						<Button type="submit">{a.createToken}</Button>
					</form>

					{created && (
						<div className="space-y-2 rounded-lg border border-state-triage/40 bg-pill-warning p-4">
							<p className="font-medium text-pill-warning-ink">{a.copyNow}</p>
							<CodeBlock code={created} />
						</div>
					)}
				</SettingsSection>

				<SettingsSection
					id="connect-oauth"
					title={a.oauthTitle}
					description={a.oauthDescription}
				>
					<CodeBlock
						label="Claude Code"
						code={`claude mcp add --transport http tattle ${baseUrl}/api/mcp`}
					/>
					{apps.length === 0 ? (
						<p className="text-muted-foreground">{a.noApp}</p>
					) : (
						<ul className="divide-y divide-rule rounded-lg border">
							{apps.map((app) => (
								<li
									key={app.clientId}
									className="flex flex-wrap items-center gap-3 px-4 py-3"
								>
									<Face name={app.name ?? a.app} kind="agent" size={28} />
									<div className="min-w-0 flex-1">
										<p className="font-medium">{app.name ?? a.unnamedApp}</p>
										<p className="text-muted-foreground">
											{a.connected} <RelativeTime iso={app.connectedAt} />
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
											toast.success(a.disconnected(app.name ?? null));
											await router.invalidate();
										}}
									>
										{a.disconnect}
									</Button>
								</li>
							))}
						</ul>
					)}
				</SettingsSection>

				<SettingsSection
					id="connect"
					title={a.tokenTitle}
					description={a.tokenDescription}
				>
					<CodeBlock
						label="Claude Code"
						code={`claude mcp add --transport http tattle ${baseUrl}/api/mcp \\\n  --header "Authorization: Bearer ${token}"`}
					/>
					<CodeBlock
						label={a.anyClient}
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
					title={a.duplicatesTitle}
					description={
						<>
							<p>{a.duplicatesIntro}</p>
							<p className="mt-2">{a.duplicatesDetail}</p>
						</>
					}
				>
					<AiSettingsForm organizationId={organization.id} settings={ai} />
				</SettingsSection>

				<SettingsSection
					id="tools"
					title={a.toolsTitle}
					description={a.toolsDescription}
				>
					<dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
						{TOOLS.map((tool) => (
							<div key={tool} className="contents">
								<dt className="font-mono text-xs leading-5">{tool}</dt>
								<dd className="text-muted-foreground">{a.tools[tool]}</dd>
							</div>
						))}
					</dl>
				</SettingsSection>
			</div>
		</>
	);
}
