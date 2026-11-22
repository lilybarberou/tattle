import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLoaderData,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import {
	BellIcon,
	BotIcon,
	ChartColumnIcon,
	CheckIcon,
	ChevronsUpDownIcon,
	InboxIcon,
	LanguagesIcon,
	LightbulbIcon,
	ListIcon,
	LogOutIcon,
	MenuIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	ShieldIcon,
	UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	type AppActions,
	AppActionsContext,
	useAppActions,
} from "#/components/app-actions";
import { Brand } from "#/components/brand";
import { CommandMenu } from "#/components/command-menu";
import { Face } from "#/components/issue-meta";
import {
	type NewIssueDefaults,
	NewIssueDialog,
} from "#/components/new-issue-dialog";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "#/components/ui/sheet";
import {
	LOCALE_NAMES,
	LOCALE_PREFERENCES,
	type LocalePreference,
} from "#/i18n/locales";
import { useI18n } from "#/i18n/react";
import { authClient } from "#/lib/auth-client";
import { cn } from "#/lib/utils";
import {
	getSessionFn,
	getWorkspaceFn,
	setLocalePreferenceFn,
} from "#/server/fns";

export const Route = createFileRoute("/_app")({
	beforeLoad: async () => {
		const session = await getSessionFn();
		if (!session) throw redirect({ to: "/login" });
		return { user: session.user };
	},
	loader: async () => {
		const workspace = await getWorkspaceFn();
		if (workspace.projects.length === 0) throw redirect({ to: "/onboarding" });
		return workspace;
	},
	component: AppLayout,
});

const isTyping = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// Shortcuts wait while a dialog, a menu or a list of options is open: their
// letters belong to it ("a" picks an item in a menu, it must not accept).
const OVERLAY =
	"[role=dialog], [role=alertdialog], [role=menu], [role=listbox]";

function NavLink({
	to,
	params,
	icon: Icon,
	children,
	count,
	onNavigate,
}: {
	to: string;
	params?: Record<string, string>;
	icon: typeof InboxIcon;
	children: React.ReactNode;
	count?: number;
	onNavigate?: () => void;
}) {
	return (
		<Link
			to={to}
			params={params}
			onClick={onNavigate}
			className="flex h-8 items-center gap-2.5 rounded-md px-2 text-muted-foreground hover:bg-active/70 hover:text-ink"
			activeProps={{ className: "bg-active text-ink" }}
		>
			<Icon className="size-4" />
			<span className="flex-1 truncate">{children}</span>
			{count !== undefined && count > 0 && (
				<span className="num rounded-full bg-surface px-1.5 text-xs font-medium text-ink">
					{count}
				</span>
			)}
		</Link>
	);
}

function SidebarContent({
	onNavigate,
	inSheet,
}: {
	onNavigate?: () => void;
	/** In the phone menu: the sheet's close button sits at the top right. */
	inSheet?: boolean;
}) {
	const { organizations, projects, build } = Route.useLoaderData();
	const { user } = Route.useRouteContext();
	const navigate = useNavigate();
	const { newIssue } = useAppActions();
	const { m } = useI18n();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const activeId = pathname.match(/^\/p\/([^/]+)/)?.[1];
	const current = projects.find((p) => p.id === activeId) ?? projects[0];
	if (!current) return null;
	const params = { projectId: current.id };

	return (
		<div className="flex h-full flex-col gap-5 px-3 py-3">
			<div
				className={cn(
					"flex items-center justify-between gap-2 px-1",
					inSheet && "pr-8",
				)}
			>
				<Brand />
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label={m.app.nav.newIssue}
					title={m.app.nav.newIssueShortcut}
					onClick={() => {
						onNavigate?.();
						newIssue();
					}}
				>
					<PlusIcon className="size-4" />
				</Button>
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger className="flex h-10 items-center gap-2.5 rounded-md border bg-surface px-2.5 text-left hover:bg-raised">
					<span className="flex size-6 items-center justify-center rounded-md bg-ink text-xs font-semibold text-surface">
						{current.name.slice(0, 1).toUpperCase()}
					</span>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium">{current.name}</span>
						<span className="block truncate text-xs text-muted-foreground">
							{organizations[0]?.name}
						</span>
					</span>
					<ChevronsUpDownIcon className="size-4 text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
						{m.app.nav.projects}
					</DropdownMenuLabel>
					{projects.map((p) => (
						<DropdownMenuItem
							key={p.id}
							onSelect={() => {
								onNavigate?.();
								void navigate({
									to: "/p/$projectId/triage",
									params: { projectId: p.id },
								});
							}}
						>
							<span className="flex-1 truncate">{p.name}</span>
							{p.id === current.id && <CheckIcon className="size-4" />}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={() => {
							onNavigate?.();
							void navigate({ to: "/onboarding" });
						}}
					>
						<PlusIcon className="size-4" />
						{m.app.nav.newProject}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<nav className="flex flex-col gap-0.5" aria-label={m.app.nav.projectNav}>
				<NavLink
					to="/p/$projectId/triage"
					params={params}
					icon={InboxIcon}
					count={current.triageCount}
					onNavigate={onNavigate}
				>
					{m.app.nav.triage}
				</NavLink>
				<NavLink
					to="/p/$projectId/issues"
					params={params}
					icon={ListIcon}
					onNavigate={onNavigate}
				>
					{m.app.nav.issues}
				</NavLink>
				<NavLink
					to="/p/$projectId/requests"
					params={params}
					icon={LightbulbIcon}
					onNavigate={onNavigate}
				>
					{m.app.nav.requests}
				</NavLink>
				<NavLink
					to="/p/$projectId/overview"
					params={params}
					icon={ChartColumnIcon}
					onNavigate={onNavigate}
				>
					{m.app.nav.overview}
				</NavLink>
				<NavLink
					to="/p/$projectId/settings"
					params={params}
					icon={SettingsIcon}
					onNavigate={onNavigate}
				>
					{m.app.nav.projectSettings}
				</NavLink>
			</nav>

			<nav
				className="mt-auto flex flex-col gap-0.5"
				aria-label={m.app.nav.workspaceNav}
			>
				<NavLink to="/members" icon={UsersIcon} onNavigate={onNavigate}>
					{m.app.nav.members}
				</NavLink>
				<NavLink to="/agents" icon={BotIcon} onNavigate={onNavigate}>
					{m.app.nav.agents}
				</NavLink>
				<NavLink to="/privacy" icon={ShieldIcon} onNavigate={onNavigate}>
					{m.app.nav.privacy}
				</NavLink>
				<DropdownMenu>
					<DropdownMenuTrigger className="flex h-10 items-center gap-2.5 rounded-md px-2 text-left hover:bg-active/70">
						<Face name={user.name} id={user.id} size={22} />
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">{user.name}</span>
							<span className="block truncate text-xs text-muted-foreground">
								{user.email}
							</span>
						</span>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-56">
						<DropdownMenuItem asChild>
							<Link to="/notifications" onClick={onNavigate}>
								<BellIcon className="size-4" />
								{m.app.nav.notifications}
							</Link>
						</DropdownMenuItem>
						<LanguageMenu />
						<DropdownMenuItem
							onSelect={async () => {
								await authClient.signOut();
								await navigate({ to: "/login" });
							}}
						>
							<LogOutIcon className="size-4" />
							{m.app.nav.signOut}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{build.url ? (
							<DropdownMenuItem asChild>
								<a
									href={build.url}
									target="_blank"
									rel="noreferrer"
									className="text-xs text-muted-foreground"
								>
									{m.app.nav.version(build.version)}
								</a>
							</DropdownMenuItem>
						) : (
							<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
								{m.app.nav.version(build.version)}
							</DropdownMenuLabel>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</nav>
		</div>
	);
}

/** The dashboard's language: Auto (the browser's), English or Français. */
function LanguageMenu() {
	const { m } = useI18n();
	const router = useRouter();
	const languages = useLoaderData({ from: "__root__" });
	const current: LocalePreference = languages?.preference ?? "auto";
	const choose = async (value: string) => {
		const preference = LOCALE_PREFERENCES.find((p) => p === value);
		if (!preference || preference === current) return;
		try {
			await setLocalePreferenceFn({ data: { preference } });
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : m.app.language.saveFailed,
			);
		}
	};
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<LanguagesIcon className="size-4" />
				<span className="flex-1">{m.common.language.label}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-56">
				<DropdownMenuRadioGroup value={current} onValueChange={choose}>
					{LOCALE_PREFERENCES.map((preference) => (
						<DropdownMenuRadioItem
							key={preference}
							value={preference}
							lang={preference === "auto" ? undefined : preference}
						>
							{preference === "auto"
								? m.common.language.auto
								: LOCALE_NAMES[preference]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function AppLayout() {
	const { projects } = Route.useLoaderData();
	const { m } = useI18n();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const activeId = pathname.match(/^\/p\/([^/]+)/)?.[1];
	const current = projects.find((p) => p.id === activeId) ?? projects[0];
	const [newIssue, setNewIssue] = useState<NewIssueDefaults | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	const actions: AppActions = {
		newIssue: useCallback((defaults) => setNewIssue(defaults ?? {}), []),
		openSearch: useCallback(() => setSearchOpen(true), []),
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setSearchOpen((open) => !open);
				return;
			}
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				isTyping(event.target)
			)
				return;
			if (event.defaultPrevented || document.querySelector(OVERLAY)) return;
			if (event.key === "c") {
				event.preventDefault();
				setNewIssue({});
			} else if (event.key === "/") {
				event.preventDefault();
				setSearchOpen(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<AppActionsContext.Provider value={actions}>
			{/* First Tab stop: jumps past the sidebar. Hidden until focused. */}
			<a
				href="#content"
				className="fixed top-2 left-2 z-50 -translate-y-[200%] rounded-md border bg-surface px-3 py-2 font-medium text-ink shadow-md focus:translate-y-0 focus-visible:outline-2"
			>
				{m.app.nav.skipToContent}
			</a>
			<div className="grid min-h-dvh md:h-dvh md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] md:grid-rows-[48px_minmax(0,1fr)]">
				<aside
					aria-label={m.app.nav.sidebar}
					className="row-span-2 max-md:hidden"
				>
					<SidebarContent />
				</aside>

				{/* Top bar: on the frame, no rule. Search centred on the sheet. */}
				<header className="flex h-12 items-center gap-2 px-3 md:pr-[calc(var(--sheet-inset)+8px)] md:pl-2">
					<Button
						size="icon-sm"
						variant="ghost"
						className="md:hidden"
						aria-label={m.app.nav.openMenu}
						onClick={() => setMenuOpen(true)}
					>
						<MenuIcon className="size-5" />
					</Button>
					<span className="font-medium md:hidden">{current?.name}</span>
					<button
						type="button"
						onClick={() => setSearchOpen(true)}
						className="mx-auto hidden h-8 w-full max-w-[548px] items-center gap-2 rounded-md border bg-surface px-3 text-muted-foreground hover:border-control md:flex"
					>
						<SearchIcon className="size-4" />
						<span className="flex-1 text-left">
							{m.app.nav.searchPlaceholder}
						</span>
						<kbd>⌘K</kbd>
					</button>
					<div className="ml-auto flex items-center gap-1 md:ml-0">
						<Button
							size="icon-sm"
							variant="ghost"
							className="md:hidden"
							aria-label={m.app.nav.search}
							onClick={() => setSearchOpen(true)}
						>
							<SearchIcon className="size-4" />
						</Button>
						<Button
							size="sm"
							className="md:hidden"
							onClick={() => setNewIssue({})}
						>
							<PlusIcon className="size-4" />
							{m.app.nav.newShort}
						</Button>
					</div>
				</header>

				{/* The sheet: white, inset 8px right and bottom, 16px corners, 1px edge, no shadow. */}
				<main
					id="content"
					tabIndex={-1}
					className={cn(
						"min-w-0 overflow-y-auto bg-surface outline-none",
						"md:mr-[var(--sheet-inset)] md:mb-[var(--sheet-inset)] md:rounded-[var(--radius-sheet)] md:border",
					)}
				>
					<Outlet />
				</main>
			</div>

			<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
				<SheetContent side="left" className="w-[85vw] max-w-80 bg-ground p-0">
					<SheetTitle className="sr-only">{m.app.nav.menu}</SheetTitle>
					<SheetDescription className="sr-only">
						{m.app.nav.menuDescription}
					</SheetDescription>
					<SidebarContent inSheet onNavigate={() => setMenuOpen(false)} />
				</SheetContent>
			</Sheet>

			{current && (
				<>
					<NewIssueDialog
						open={newIssue !== null}
						onOpenChange={(open) => !open && setNewIssue(null)}
						project={current}
						defaults={newIssue ?? undefined}
					/>
					<CommandMenu
						open={searchOpen}
						onOpenChange={setSearchOpen}
						projectId={current.id}
						onNewIssue={(type) => setNewIssue({ type })}
					/>
				</>
			)}
		</AppActionsContext.Provider>
	);
}
