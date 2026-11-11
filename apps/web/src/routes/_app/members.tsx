import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CodeBlock } from "#/components/code-block";
import { Face, relativeTime } from "#/components/issue-meta";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
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

const roleLabel = (role: string) =>
	role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";

function MembersPage() {
	const { organization, members, invitations, canManage } =
		Route.useLoaderData();
	const router = useRouter();
	const [role, setRole] = useState<"member" | "admin">("member");
	const [link, setLink] = useState<string | null>(null);

	return (
		<>
			<PageHeader
				title="Members"
				description={`${members.length} ${members.length === 1 ? "person" : "people"} in ${organization.name}. Sign-up is closed: people join with an invitation.`}
			/>
			<div className="px-6 pb-10">
				<SettingsSection
					id="people"
					title="People"
					description="Everyone here sees every project, triages reports and can create API tokens for agents."
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
					title="Invite someone"
					description="We email the invitation when SMTP is set up on this server; the link works too. It is valid 7 days: they create their account with that email and join right away."
				>
					{canManage ? (
						<form
							className="space-y-4 rounded-lg bg-raised p-4"
							onSubmit={async (event) => {
								event.preventDefault();
								const form = event.currentTarget;
								try {
									const result = await inviteMemberFn({
										data: {
											organizationId: organization.id,
											email: String(new FormData(form).get("email")),
											role,
										},
									});
									setLink(result.link);
									if (result.emailed) toast.success("Invitation sent by email");
									form.reset();
									await router.invalidate();
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: "Invitation failed",
									);
								}
							}}
						>
							<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
								<div className="space-y-2">
									<Label htmlFor="invite-email">Email</Label>
									<Input
										id="invite-email"
										name="email"
										type="email"
										required
										placeholder="camille@atelier-nord.fr"
									/>
								</div>
								<fieldset className="flex rounded-md border border-control p-0.5">
									<legend className="sr-only">Role</legend>
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
							<Button type="submit">Create invitation</Button>
						</form>
					) : (
						<p className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
							Only owners and admins can invite people.
						</p>
					)}
					{link && (
						<CodeBlock
							label="Invitation link (also usable if the email gets lost)"
							code={link}
						/>
					)}
					{invitations.length > 0 && (
						<div>
							<h3 className="mb-2 font-medium">Waiting to join</h3>
							<ul className="divide-y divide-rule rounded-lg border">
								{invitations.map((invite) => (
									<li
										key={invite.id}
										className="flex flex-wrap items-center gap-3 px-4 py-3"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate">{invite.email}</p>
											<p className="text-muted-foreground">
												{roleLabel(invite.role)} · expires{" "}
												{relativeTime(invite.expiresAt)}
											</p>
										</div>
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
													toast.success("Invitation canceled");
													await router.invalidate();
												}}
											>
												Cancel
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
