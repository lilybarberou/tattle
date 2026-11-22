import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CodeBlock } from "#/components/code-block";
import { Face } from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { RelativeTime } from "#/components/time";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/i18n/react";
import {
	getInvitationLinkFn,
	getWorkspaceFn,
	inviteMemberFn,
	listMembersFn,
	revokeInvitationFn,
} from "#/server/fns";

export const Route = createFileRoute("/_app/members")({
	loader: async () => {
		const { organizations } = await getWorkspaceFn();
		const organization = organizations[0];
		if (!organization) throw new Error("No organization");
		const data = await listMembersFn({
			data: { organizationId: organization.id },
		});
		return { organization, ...data };
	},
	component: MembersPage,
});

function MembersPage() {
	const { organization, members, invitations, canManage } =
		Route.useLoaderData();
	const router = useRouter();
	const { m: t } = useI18n();
	const roleLabel = (role: string) =>
		role === "owner"
			? t.common.role.owner
			: role === "admin"
				? t.common.role.admin
				: t.common.role.member;
	const [role, setRole] = useState<"member" | "admin">("member");
	const [link, setLink] = useState<{ email: string; url: string } | null>(null);

	return (
		<>
			<PageHeader
				title={t.workspace.members.title}
				description={t.workspace.members.description(
					members.length,
					organization.name,
				)}
			/>
			<div className="px-6 pb-10">
				<SettingsSection
					id="people"
					title={t.workspace.members.peopleTitle}
					description={t.workspace.members.peopleDescription}
				>
					<ul className="divide-y divide-rule rounded-lg border">
						{members.map((m) => (
							<li key={m.id} className="flex items-center gap-3 px-4 py-3">
								<Face name={m.name} id={m.userId} size={28} />
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">{m.name}</p>
									<p className="truncate text-muted-foreground">{m.email}</p>
								</div>
								<span className="text-muted-foreground">
									{roleLabel(m.role)}
								</span>
							</li>
						))}
					</ul>
				</SettingsSection>

				<SettingsSection
					id="invite"
					title={t.workspace.members.inviteTitle}
					description={t.workspace.members.inviteDescription}
				>
					{canManage ? (
						<form
							className="space-y-4 rounded-lg bg-raised p-4"
							onSubmit={async (event) => {
								event.preventDefault();
								const form = event.currentTarget;
								try {
									const data = {
										organizationId: organization.id,
										email: String(new FormData(form).get("email")).trim(),
										role,
									};
									const result = await inviteMemberFn({ data });
									setLink({ email: data.email, url: result.link });
									if (result.emailed)
										toast.success(t.workspace.members.invitationEmailed);
									form.reset();
									await router.invalidate();
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: t.workspace.members.invitationFailed,
									);
								}
							}}
						>
							<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
								<div className="space-y-2">
									<Label htmlFor="invite-email">
										{t.workspace.members.email}
									</Label>
									<Input
										id="invite-email"
										name="email"
										type="email"
										required
										placeholder={t.workspace.members.emailPlaceholder}
									/>
								</div>
								<fieldset className="flex rounded-md border border-control p-0.5">
									<legend className="sr-only">
										{t.workspace.members.role}
									</legend>
									{(["member", "admin"] as const).map((r) => (
										<button
											key={r}
											type="button"
											aria-pressed={role === r}
											onClick={() => setRole(r)}
											className={
												role === r
													? "rounded bg-active px-3 py-1 font-medium"
													: "rounded px-3 py-1 text-muted-foreground hover:text-ink"
											}
										>
											{roleLabel(r)}
										</button>
									))}
								</fieldset>
							</div>
							<Button type="submit">
								{t.workspace.members.createInvitation}
							</Button>
						</form>
					) : (
						<p className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
							{t.workspace.members.onlyAdminsInvite}
						</p>
					)}
					{link && (
						<CodeBlock
							label={t.workspace.members.invitationLink(link.email)}
							code={link.url}
						/>
					)}
					{invitations.length > 0 && (
						<div>
							<h3 className="mb-2 font-medium">
								{t.workspace.members.waiting}
							</h3>
							<ul className="divide-y divide-rule rounded-lg border">
								{invitations.map((invite) => (
									<li
										key={invite.id}
										className="flex flex-wrap items-center gap-3 px-4 py-3"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate">{invite.email}</p>
											<p className="text-muted-foreground">
												{roleLabel(invite.role)} · {t.workspace.members.expires}{" "}
												<RelativeTime iso={invite.expiresAt} />
											</p>
										</div>
										{canManage && (
											<Button
												variant="ghost"
												size="sm"
												onClick={async () => {
													try {
														const shown = await getInvitationLinkFn({
															data: {
																organizationId: organization.id,
																invitationId: invite.id,
															},
														});
														setLink({ email: shown.email, url: shown.link });
													} catch (error) {
														toast.error(
															error instanceof Error
																? error.message
																: t.workspace.members.linkUnavailable,
														);
														await router.invalidate();
													}
												}}
											>
												{t.workspace.members.showLink}
											</Button>
										)}
										{canManage && (
											<Button
												variant="outline"
												size="sm"
												onClick={async () => {
													await revokeInvitationFn({
														data: {
															organizationId: organization.id,
															invitationId: invite.id,
														},
													});
													toast.success(t.workspace.members.invitationCanceled);
													await router.invalidate();
												}}
											>
												{t.workspace.members.cancel}
											</Button>
										)}
									</li>
								))}
							</ul>
						</div>
					)}
				</SettingsSection>
			</div>
		</>
	);
}
