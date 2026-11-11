import { createFileRoute, useRouter } from "@tanstack/react-router";
import { DownloadIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { ReporterMatch } from "#/server/DataLifecycle";
import {
	eraseReporterFn,
	exportReporterFn,
	findReporterFn,
	getPrivacySettingsFn,
	getWorkspaceFn,
} from "#/server/fns";

export const Route = createFileRoute("/_app/privacy")({
	loader: async () => {
		const [{ organizations }, settings] = await Promise.all([
			getWorkspaceFn(),
			getPrivacySettingsFn(),
		]);
		const organization = organizations[0];
		if (!organization) throw new Error("No organization");
		return { organization, ...settings };
	},
	component: PrivacyPage,
});

const COLLECTED: Array<[string, string]> = [
	[
		"Account",
		"What your app passes to identify(): id, email, name and any traits.",
	],
	[
		"Message and screenshot",
		"What the person wrote, and the annotated screenshot if they took one. Password and card fields are masked.",
	],
	[
		"Console",
		"The last 200 console messages and JavaScript errors on the page.",
	],
	[
		"Network",
		"The last 100 requests: method, URL, status, duration. No bodies or headers; tokens in URLs are redacted.",
	],
	["Device", "Browser, system, screen and window size, language, time zone."],
	[
		"Portal votes",
		"A random id in a cookie, and an email only if the visitor leaves one.",
	],
];

function PrivacyPage() {
	const { organization, retentionDays } = Route.useLoaderData();
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [match, setMatch] = useState<
		(ReporterMatch & { query: string }) | null
	>(null);
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const data = {
		organizationId: organization.id,
		query: match?.query ?? query,
	};

	const download = async () => {
		const json = await exportReporterFn({ data });
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
			<PageHeader
				title="Privacy"
				description="Find, export or erase what the widget collected about one person, and decide how long reports keep their screenshots and logs."
			/>
			<div className="px-6 pb-10">
				<SettingsSection
					id="person"
					title="One person's data"
					description="For an access or erasure request (GDPR). Search by the email or the user id your app gives the widget. Covers every project of this workspace."
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
									error instanceof Error ? error.message : "Search failed",
								);
							} finally {
								setBusy(false);
							}
						}}
					>
						<div className="flex-1 space-y-2">
							<Label htmlFor="person-query">Email or user id</Label>
							<Input
								id="person-query"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="lea.martin@gmail.com"
								required
							/>
						</div>
						<Button type="submit" variant="outline" disabled={busy}>
							<SearchIcon className="size-4" />
							Find
						</Button>
					</form>

					{match && (
						<div className="max-w-xl space-y-3 rounded-lg border p-4">
							{match.reports + match.votes === 0 ? (
								<p className="text-muted-foreground">
									Nothing stored for “{match.query}”.
								</p>
							) : (
								<>
									<p>
										<span className="font-medium">{match.query}</span>:{" "}
										<span className="num">{match.reports}</span>{" "}
										{match.reports === 1 ? "report" : "reports"}
										{match.projects.length > 0 &&
											` in ${match.projects.join(", ")}`}
										, <span className="num">{match.votes}</span>{" "}
										{match.votes === 1 ? "vote" : "votes"} on public pages.
									</p>
									<div className="flex flex-wrap gap-2">
										<Button variant="outline" onClick={download}>
											<DownloadIcon className="size-4" />
											Download as JSON
										</Button>
										{!confirming ? (
											<Button
												variant="ghost"
												className="text-negative"
												onClick={() => setConfirming(true)}
											>
												<Trash2Icon className="size-4" />
												Erase…
											</Button>
										) : (
											<Button
												variant="destructive"
												disabled={busy}
												onClick={async () => {
													setBusy(true);
													try {
														const result = await eraseReporterFn({ data });
														toast.success(
															`Erased ${result.reports} reports and ${result.votes} votes; ${result.issues} issues they opened were deleted`,
														);
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
																: "Not erased",
														);
													} finally {
														setBusy(false);
													}
												}}
											>
												Erase {match.reports + match.votes} items for good
											</Button>
										)}
									</div>
									{confirming && (
										<p className="text-muted-foreground">
											Their reports, screenshots and votes are deleted. An issue
											only they reported is deleted too, since its title is
											their words; issues others also reported stay.
										</p>
									)}
								</>
							)}
						</div>
					)}
				</SettingsSection>

				<SettingsSection
					id="retention"
					title="How long reports are kept"
					description={
						<>
							Set{" "}
							<code className="font-mono text-xs">REPORT_RETENTION_DAYS</code>{" "}
							on the server to drop screenshots and logs of older reports. The
							message and the reporter stay, so issues keep their history.
						</>
					}
				>
					<p className="max-w-xl rounded-lg bg-raised px-4 py-3">
						{retentionDays
							? `Screenshots, console and network logs are deleted ${retentionDays} days after a report arrives.`
							: "Reports keep their screenshots and logs until you delete them."}
					</p>
				</SettingsSection>

				<SettingsSection
					id="collected"
					title="What the widget collects"
					description="Useful for your privacy policy: list this under the tool you use for bug reports."
				>
					<dl className="grid max-w-2xl gap-x-6 gap-y-3 sm:grid-cols-[160px_minmax(0,1fr)]">
						{COLLECTED.map(([term, text]) => (
							<div key={term} className="contents">
								<dt className="font-medium">{term}</dt>
								<dd className="text-muted-foreground">{text}</dd>
							</div>
						))}
					</dl>
				</SettingsSection>
			</div>
		</>
	);
}
