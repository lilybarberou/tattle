import { createFileRoute, useRouter } from "@tanstack/react-router";
import { DownloadIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
import { useInlineConfirm } from "#/lib/use-inline-confirm";
import type { ReporterMatch } from "#/server/DataLifecycle";
import {
	eraseReporterFn,
	exportReporterFn,
	findReporterFn,
	getPrivacySettingsFn,
	getWorkspaceFn,
	listMembersFn,
} from "#/server/fns";

export const Route = createFileRoute("/_app/privacy")({
	loader: async () => {
		const [{ organizations }, settings] = await Promise.all([
			getWorkspaceFn(),
			getPrivacySettingsFn(),
		]);
		const organization = organizations[0];
		if (!organization) throw new Error("No organization");
		// Export and erasure are for owners and admins (the server says 403).
		const { canManage } = await listMembersFn({
			data: { organizationId: organization.id },
		});
		return { organization, canManage, ...settings };
	},
	component: PrivacyPage,
});

const COLLECTED = [
	"account",
	"message",
	"console",
	"network",
	"device",
	"votes",
] as const;

function PrivacyPage() {
	const { organization, canManage, retentionDays } = Route.useLoaderData();
	const router = useRouter();
	const { m } = useI18n();
	const t = m.workspace.privacy;
	const [query, setQuery] = useState("");
	const [match, setMatch] = useState<
		(ReporterMatch & { query: string }) | null
	>(null);
	const [busy, setBusy] = useState(false);
	// Focus goes to "Keep" while the question shows: pressing Enter twice
	// on "Erase…" never erases.
	const { confirming, setConfirming, trigger, cancel } = useInlineConfirm();
	const data = {
		organizationId: organization.id,
		query: match?.query ?? query,
	};

	const download = async () => {
		let json: string;
		try {
			json = await exportReporterFn({ data });
		} catch (error) {
			// A member is refused: say so instead of doing nothing.
			toast.error(error instanceof Error ? error.message : t.exportFailed);
			return;
		}
		const url = URL.createObjectURL(
			new Blob([json], { type: "application/json" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `data-${data.query.replace(/[^a-z0-9@._-]/gi, "_")}.json`;
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<>
			<PageHeader title={t.title} description={t.description} />
			<div className="px-6 pb-10">
				<SettingsSection
					id="person"
					title={t.personTitle}
					description={t.personDescription}
				>
					<form
						className="flex max-w-xl items-end gap-2"
						onSubmit={async (e) => {
							e.preventDefault();
							setBusy(true);
							setConfirming(false);
							try {
								const found = await findReporterFn({
									data: { organizationId: organization.id, query },
								});
								setMatch({ ...found, query: query.trim() });
							} catch (error) {
								toast.error(
									error instanceof Error ? error.message : t.searchFailed,
								);
							} finally {
								setBusy(false);
							}
						}}
					>
						<div className="flex-1 space-y-2">
							<Label htmlFor="person-query">{t.query}</Label>
							<Input
								id="person-query"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder={t.queryPlaceholder}
								required
							/>
						</div>
						<Button type="submit" variant="outline" disabled={busy}>
							<SearchIcon className="size-4" />
							{t.find}
						</Button>
					</form>

					{match && (
						<div className="max-w-xl space-y-3 rounded-lg border p-4">
							{match.reports + match.votes === 0 ? (
								<p className="text-muted-foreground">
									{t.nothingStored(match.query)}
								</p>
							) : (
								<>
									<p>
										<span className="font-medium">{match.query}</span>:{" "}
										<span className="num">{match.reports}</span>{" "}
										{t.reports(match.reports)}
										{match.projects.length > 0 &&
											t.inProjects(match.projects.join(", "))}
										, <span className="num">{match.votes}</span>{" "}
										{t.votes(match.votes)}
										{t.onPublicPages}
									</p>
									{!canManage && (
										<p className="text-muted-foreground">{t.onlyAdmins}</p>
									)}
									{canManage && (
										<div className="flex flex-wrap gap-2">
											<Button variant="outline" onClick={download}>
												<DownloadIcon className="size-4" />
												{t.download}
											</Button>
											{!confirming ? (
												<Button
													ref={trigger}
													variant="ghost"
													className="text-negative"
													onClick={() => setConfirming(true)}
												>
													<Trash2Icon className="size-4" />
													{t.erase}
												</Button>
											) : (
												<>
													<Button
														variant="destructive"
														disabled={busy}
														onClick={async () => {
															setBusy(true);
															try {
																const result = await eraseReporterFn({ data });
																toast.success(t.erased(result));
																setMatch({
																	...match,
																	reports: 0,
																	votes: 0,
																	projects: [],
																});
																setConfirming(false);
																await router.invalidate();
															} catch (error) {
																toast.error(
																	error instanceof Error
																		? error.message
																		: t.notErased,
																);
															} finally {
																setBusy(false);
															}
														}}
													>
														{t.eraseForGood(match.reports + match.votes)}
													</Button>
													<Button
														ref={cancel}
														variant="ghost"
														onClick={() => setConfirming(false)}
													>
														{t.keep}
													</Button>
												</>
											)}
										</div>
									)}
									{confirming && (
										<p className="text-muted-foreground">{t.eraseExplained}</p>
									)}
								</>
							)}
						</div>
					)}
				</SettingsSection>

				<SettingsSection
					id="retention"
					title={t.retentionTitle}
					description={
						<>
							{t.retentionSet}{" "}
							<code className="font-mono text-xs">REPORT_RETENTION_DAYS</code>{" "}
							{t.retentionDescription}
						</>
					}
				>
					<p className="max-w-xl rounded-lg bg-raised px-4 py-3">
						{retentionDays ? t.retentionDays(retentionDays) : t.retentionNone}
					</p>
				</SettingsSection>

				<SettingsSection
					id="collected"
					title={t.collectedTitle}
					description={t.collectedDescription}
				>
					<dl className="grid max-w-2xl gap-x-6 gap-y-3 sm:grid-cols-[160px_minmax(0,1fr)]">
						{COLLECTED.map((key) => (
							<div key={key} className="contents">
								<dt className="font-medium">{t.collected[key].term}</dt>
								<dd className="text-muted-foreground">
									{t.collected[key].text}
								</dd>
							</div>
						))}
					</dl>
				</SettingsSection>
			</div>
		</>
	);
}
