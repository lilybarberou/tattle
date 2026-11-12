import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { Checkbox } from "#/components/ui/checkbox";
import {
	getNotificationSettingsFn,
	updateNotificationSettingFn,
} from "#/server/fns";
import {
	NOTIFICATION_META,
	NOTIFICATION_TYPES,
	type NotificationSettingsView,
	type NotificationType,
} from "#/shared/notifications";

export const Route = createFileRoute("/_app/notifications")({
	loader: () => getNotificationSettingsFn(),
	component: NotificationsPage,
});

const hour = (h: number) => `${String(h).padStart(2, "0")}:00 UTC`;

function NotificationsPage() {
	const initial = Route.useLoaderData();
	const [view, setView] = useState<NotificationSettingsView>(initial);
	const [saving, setSaving] = useState<NotificationType | null>(null);

	const toggle = async (type: NotificationType, on: boolean) => {
		setSaving(type);
		setView((v) => ({ ...v, settings: { ...v.settings, [type]: on } }));
		try {
			setView(await updateNotificationSettingFn({ data: { type, on } }));
		} catch (error) {
			setView((v) => ({ ...v, settings: { ...v.settings, [type]: !on } }));
			toast.error(error instanceof Error ? error.message : "Not saved");
		} finally {
			setSaving(null);
		}
	};

	const row = (type: NotificationType) => {
		const meta = NOTIFICATION_META[type];
		return (
			<li key={type} className="px-4 py-3">
				<label htmlFor={`notify-${type}`} className="flex items-start gap-3">
					<Checkbox
						id={`notify-${type}`}
						className="mt-0.5"
						checked={view.settings[type]}
						disabled={saving === type}
						onCheckedChange={(v) => void toggle(type, v === true)}
					/>
					<span className="min-w-0 space-y-0.5">
						<span className="block font-medium">{meta.label}</span>
						<span className="block text-muted-foreground">
							{type === "triage_digest"
								? `${meta.description} Sent around ${hour(view.digestHourUtc)}.`
								: meta.description}
						</span>
					</span>
				</label>
			</li>
		);
	};

	const team = NOTIFICATION_TYPES.filter(
		(t) => !NOTIFICATION_META[t].adminOnly && t !== "triage_digest",
	);
	const adminOnly = NOTIFICATION_TYPES.filter(
		(t) => NOTIFICATION_META[t].adminOnly,
	);

	return (
		<>
			<PageHeader
				title="Notifications"
				description={`Emails to ${view.email} for things you need to act on. Discord, Slack and webhooks cover everything else.`}
			/>
			<div className="px-6 pb-10">
				{!view.mailEnabled && (
					<p className="mb-2 rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
						This server has no SMTP settings, so no email is sent. Your choices
						are kept for when it does.
					</p>
				)}
				<SettingsSection
					id="work"
					title="Your work"
					description="Never for what you did yourself. Every email also has a link to stop its kind."
				>
					<ul className="divide-y divide-rule rounded-lg border">
						{team.map(row)}
					</ul>
				</SettingsSection>
				<SettingsSection
					id="digest"
					title="Digest"
					description="One email a day at most, only when something new waits in Triage."
				>
					<ul className="divide-y divide-rule rounded-lg border">
						{row("triage_digest")}
					</ul>
				</SettingsSection>
				{view.isAdmin && (
					<SettingsSection
						id="workspace"
						title="Workspace health"
						description="For owners and admins: when something set up for the workspace stops working."
					>
						<ul className="divide-y divide-rule rounded-lg border">
							{adminOnly.map(row)}
						</ul>
					</SettingsSection>
				)}
			</div>
		</>
	);
}
