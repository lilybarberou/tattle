import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "#/components/page-header";
import { SettingsSection } from "#/components/settings-section";
import { Checkbox } from "#/components/ui/checkbox";
import { useI18n } from "#/i18n/react";
import {
	getNotificationSettingsFn,
	updateNotificationSettingFn,
} from "#/server/fns";
import {
	NOTIFICATION_META,
	NOTIFICATION_TYPES,
	type NotificationSettingsView,
	type NotificationType,
	REPORTER_REPLY_WINDOW_MINUTES,
} from "#/shared/notifications";

export const Route = createFileRoute("/_app/notifications")({
	loader: () => getNotificationSettingsFn(),
	component: NotificationsPage,
});

const hour = (h: number) => `${String(h).padStart(2, "0")}:00 UTC`;

function NotificationsPage() {
	const initial = Route.useLoaderData();
	const { m } = useI18n();
	const [view, setView] = useState<NotificationSettingsView>(initial);
	const [saving, setSaving] = useState<NotificationType | null>(null);

	const toggle = async (type: NotificationType, on: boolean) => {
		setSaving(type);
		setView((v) => ({ ...v, settings: { ...v.settings, [type]: on } }));
		try {
			setView(await updateNotificationSettingFn({ data: { type, on } }));
		} catch (error) {
			setView((v) => ({ ...v, settings: { ...v.settings, [type]: !on } }));
			toast.error(
				error instanceof Error ? error.message : m.common.errors.notSaved,
			);
		} finally {
			setSaving(null);
		}
	};

	const row = (type: NotificationType) => {
		const text = m.common.notificationType[type];
		const description =
			typeof text.description === "function"
				? text.description(REPORTER_REPLY_WINDOW_MINUTES)
				: text.description;
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
						<span className="block font-medium">{text.label}</span>
						<span className="block text-muted-foreground">
							{type === "triage_digest"
								? `${description} ${m.workspace.notifications.sentAround(hour(view.digestHourUtc))}`
								: description}
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
				title={m.workspace.notifications.title}
				description={m.workspace.notifications.description(view.email)}
			/>
			<div className="px-6 pb-10">
				{!view.mailEnabled && (
					<p className="mb-2 rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
						{m.workspace.notifications.noSmtp}
					</p>
				)}
				<SettingsSection
					id="work"
					title={m.workspace.notifications.workTitle}
					description={m.workspace.notifications.workDescription}
				>
					<ul className="divide-y divide-rule rounded-lg border">
						{team.map(row)}
					</ul>
				</SettingsSection>
				<SettingsSection
					id="digest"
					title={m.workspace.notifications.digestTitle}
					description={m.workspace.notifications.digestDescription}
				>
					<ul className="divide-y divide-rule rounded-lg border">
						{row("triage_digest")}
					</ul>
				</SettingsSection>
				{view.isAdmin && (
					<SettingsSection
						id="workspace"
						title={m.workspace.notifications.healthTitle}
						description={m.workspace.notifications.healthDescription}
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
