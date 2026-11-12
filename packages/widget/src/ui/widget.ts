import { openAnnotator, type Shape } from "../annotate";
import { type Capture, captureViewport } from "../capture";
import { getStrings, type Strings } from "../i18n";
import { resolveMotion } from "../motion";
import {
	buildPayload,
	IngestError,
	MAX_MESSAGE_LENGTH,
	sendPayload,
} from "../payload";
import { resolveScheme, themeVariables } from "../theme";
import type {
	ColorScheme,
	Locale,
	Position,
	TattleTheme,
	TattleType,
	TattleUser,
} from "../types";
import { h, iconButton, trapTab } from "./dom";
import { icons } from "./icons";
import { styles } from "./styles";

export interface WidgetConfig {
	projectKey: string;
	apiUrl: string;
	position: Position;
	showButton: boolean;
	locale: Locale;
	accentColor: string | undefined;
	theme: TattleTheme;
	colorScheme: ColorScheme | undefined;
	strings: Partial<Strings>;
	css: string;
	maskSelectors: string[];
	release: string | undefined;
}

export interface WidgetDeps {
	getUser(): TattleUser | null;
	getContext(): Record<string, unknown> | null;
}

interface Shot {
	capture: Capture;
	shapes: Shape[];
	dataUrl: string;
}

const HOST_TAG = "tattle-widget";
const HOST_STYLE =
	"all: initial !important; display: block !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; overflow: visible !important; z-index: 2147483647 !important; pointer-events: auto !important;";
const SUCCESS_CLOSE_MS = 2500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const media = (query: string): MediaQueryList | null =>
	typeof matchMedia === "function" ? matchMedia(query) : null;

const nextFrame = () =>
	new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export class Widget {
	readonly host: HTMLElement;
	private readonly shadow: ShadowRoot;
	private readonly t: Strings;
	private readonly root: HTMLDivElement;
	private readonly launcher: HTMLButtonElement | null = null;
	private readonly backdrop: HTMLDivElement;
	private readonly panel: HTMLDivElement;
	private readonly form: HTMLFormElement;
	private readonly success: HTMLDivElement;
	private readonly typeButtons: Record<TattleType, HTMLButtonElement>;
	private readonly shotSection: HTMLDivElement;
	private readonly captureBtn: HTMLButtonElement;
	private readonly shotRow: HTMLDivElement;
	private readonly shotImg: HTMLImageElement;
	private readonly editShotBtn: HTMLButtonElement;
	private readonly messageLabel: HTMLLabelElement;
	private readonly message: HTMLTextAreaElement;
	private readonly count: HTMLSpanElement;
	private readonly emailField: HTMLDivElement;
	private readonly email: HTMLInputElement;
	private readonly error: HTMLParagraphElement;
	private readonly submit: HTMLButtonElement;

	private type: TattleType = "bug";
	private shot: Shot | null = null;
	private busy: "capturing" | "sending" | null = null;
	private isOpen = false;
	private editor: { cancel: () => void } | null = null;
	private lastFocus: Element | null = null;
	private successTimer: ReturnType<typeof setTimeout> | undefined;
	private mounted = false;
	private destroyed = false;
	private theme: TattleTheme;
	private colorScheme: ColorScheme | undefined;
	private readonly darkQuery = media("(prefers-color-scheme: dark)");
	/** Same breakpoint as the bottom sheet in styles.ts. */
	private readonly sheetQuery = media("(max-width: 639.98px)");
	private readonly reducedMotionQuery = media(
		"(prefers-reduced-motion: reduce)",
	);
	private motion: Animation[] = [];
	private motionId = 0;

	constructor(
		private readonly config: WidgetConfig,
		private readonly deps: WidgetDeps,
	) {
		const t = { ...getStrings(config.locale), ...config.strings };
		this.t = t;
		this.theme = config.theme;
		this.colorScheme = config.colorScheme;
		this.host = document.createElement(HOST_TAG);
		this.host.setAttribute("style", HOST_STYLE);
		this.host.setAttribute("data-tattle-widget", "");
		this.shadow = this.host.attachShadow({ mode: "closed" });
		this.shadow.append(h("style", {}, styles));
		if (config.css) this.shadow.append(h("style", {}, config.css));

		this.root = h("div", { class: "fb-root" });
		this.applyTheme();
		if (config.position === "bottom-left") this.root.classList.add("fb-left");
		if (!config.showButton) this.root.classList.add("fb-no-button");

		if (config.showButton) {
			this.launcher = iconButton(icons.bug, t.launcher, "fb-launcher", {
				"aria-haspopup": "dialog",
				"aria-expanded": "false",
				"aria-controls": "fb-panel",
			});
			this.launcher.addEventListener("click", () =>
				this.isOpen ? this.close() : this.open(),
			);
			this.root.append(this.launcher);
		}

		this.backdrop = h("div", { class: "fb-backdrop", hidden: true });
		this.backdrop.addEventListener("click", () => this.close());

		// Type switch
		this.typeButtons = {
			bug: h(
				"button",
				{ type: "button", "aria-pressed": "true", html: icons.bug },
				t.bug,
			),
			feature: h(
				"button",
				{ type: "button", "aria-pressed": "false", html: icons.idea },
				t.feature,
			),
		};
		this.typeButtons.bug.addEventListener("click", () => this.setType("bug"));
		this.typeButtons.feature.addEventListener("click", () =>
			this.setType("feature"),
		);
		const seg = h(
			"div",
			{ class: "fb-seg", role: "group", "aria-label": t.typeGroup },
			this.typeButtons.bug,
			this.typeButtons.feature,
		);

		// Screenshot
		this.captureBtn = h(
			"button",
			{ type: "button", class: "fb-capture", html: icons.camera },
			t.capture,
		);
		this.captureBtn.setAttribute("aria-describedby", "fb-capture-hint");
		this.captureBtn.addEventListener("click", () => void this.startCapture());
		this.shotImg = h("img", { alt: t.screenshotAlt });
		this.editShotBtn = h(
			"button",
			{
				type: "button",
				class: "fb-btn fb-btn-ghost fb-btn-sm",
				html: icons.edit,
			},
			t.editShot,
		);
		this.editShotBtn.addEventListener("click", () => {
			if (this.shot) void this.annotate(this.shot.capture, this.shot.shapes);
		});
		const removeShotBtn = h(
			"button",
			{
				type: "button",
				class: "fb-btn fb-btn-ghost fb-btn-sm fb-btn-danger",
				html: icons.trash,
			},
			t.removeShot,
		);
		removeShotBtn.addEventListener("click", () => {
			this.shot = null;
			this.renderShot();
			this.captureBtn.focus();
		});
		this.shotRow = h(
			"div",
			{ class: "fb-shot", hidden: true },
			this.shotImg,
			h("div", { class: "fb-shot-actions" }, this.editShotBtn, removeShotBtn),
		);
		this.shotSection = h(
			"div",
			{ class: "fb-field" },
			this.captureBtn,
			this.shotRow,
			h("p", { class: "fb-hint", id: "fb-capture-hint" }, t.captureHint),
		);

		// Message
		this.messageLabel = h(
			"label",
			{ class: "fb-label", for: "fb-message" },
			t.messageLabelBug,
		);
		this.message = h("textarea", {
			id: "fb-message",
			class: "fb-textarea",
			required: true,
			maxlength: MAX_MESSAGE_LENGTH,
			placeholder: t.placeholderBug,
			rows: 5,
		});
		this.count = h(
			"span",
			{ class: "fb-count", "aria-hidden": "true" },
			`0 / ${MAX_MESSAGE_LENGTH}`,
		);
		this.message.addEventListener("input", () => {
			this.count.textContent = `${this.message.value.length} / ${MAX_MESSAGE_LENGTH}`;
			if (this.message.getAttribute("aria-invalid")) this.clearError();
		});
		const messageField = h(
			"div",
			{ class: "fb-field" },
			this.messageLabel,
			this.message,
			this.count,
		);

		// Email (only when the host did not identify the user with an email)
		this.email = h("input", {
			id: "fb-email",
			class: "fb-input",
			type: "email",
			autocomplete: "email",
			inputmode: "email",
			placeholder: t.emailPlaceholder,
			maxlength: 320,
		});
		this.email.addEventListener("input", () => {
			if (this.email.getAttribute("aria-invalid")) this.clearError();
		});
		this.emailField = h(
			"div",
			{ class: "fb-field" },
			h("label", { class: "fb-label", for: "fb-email" }, t.emailLabel),
			this.email,
		);

		this.error = h("p", {
			class: "fb-error",
			role: "alert",
			id: "fb-error",
			hidden: true,
		});
		this.submit = h(
			"button",
			{ type: "submit", class: "fb-btn fb-btn-primary fb-submit" },
			t.send,
		);

		this.form = h(
			"form",
			{ class: "fb-body", novalidate: true },
			seg,
			this.shotSection,
			messageField,
			this.emailField,
			this.error,
			this.submit,
		);
		this.form.addEventListener("submit", (event) => {
			event.preventDefault();
			void this.send();
		});

		this.success = h(
			"div",
			{ class: "fb-success", role: "status", hidden: true },
			h("div", { class: "fb-success-icon", html: icons.check }),
			h("p", {}, t.success),
		);

		const closeBtn = iconButton(icons.close, t.close, "fb-icon-btn");
		closeBtn.addEventListener("click", () => this.close());
		this.panel = h(
			"div",
			{
				id: "fb-panel",
				class: "fb-panel",
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "fb-title",
				tabindex: -1,
				hidden: true,
			},
			h(
				"div",
				{ class: "fb-header" },
				h("h2", { class: "fb-title", id: "fb-title" }, t.title),
				closeBtn,
			),
			this.form,
			this.success,
		);
		this.panel.addEventListener("keydown", (event) =>
			trapTab(event, this.panel, this.shadow.activeElement),
		);

		this.root.append(this.backdrop, this.panel);
		this.shadow.append(this.root);
		this.refreshIdentity();
	}

	/** Appends the host to the page (waits for <body> if needed). */
	mount(): void {
		if (this.mounted || this.destroyed) return;
		if (!document.body) {
			document.addEventListener("DOMContentLoaded", () => this.mount(), {
				once: true,
			});
			return;
		}
		this.mounted = true;
		document.body.append(this.host);
		document.addEventListener("keydown", this.onDocumentKey, true);
		this.darkQuery?.addEventListener?.("change", this.applyTheme);
		// "inherit" reads the font of <body>, which may not have existed before.
		if (this.theme.fontFamily === "inherit") this.applyTheme();
	}

	setTheme(theme: TattleTheme): void {
		this.theme = theme;
		this.applyTheme();
	}

	setColorScheme(scheme: ColorScheme | undefined): void {
		this.colorScheme = scheme;
		this.applyTheme();
	}

	private applyTheme = (): void => {
		const scheme = resolveScheme(this.colorScheme, this.theme);
		const dark =
			scheme === "dark" || (scheme === "system" && !!this.darkQuery?.matches);
		const theme = { ...this.theme };
		if (theme.fontFamily === "inherit") {
			const font = document.body
				? getComputedStyle(document.body).fontFamily
				: "";
			if (font) theme.fontFamily = font;
			else delete theme.fontFamily;
		}
		const vars = themeVariables(
			theme,
			dark ? "dark" : "light",
			this.config.accentColor,
		);
		for (const [name, value] of Object.entries(vars))
			this.root.style.setProperty(name, value);
		this.root.style.colorScheme = dark ? "dark" : "light";
	};

	private onDocumentKey = (event: KeyboardEvent): void => {
		if (event.key !== "Escape") return;
		if (this.editor) {
			event.preventDefault();
			event.stopPropagation();
			this.editor.cancel();
		} else if (this.isOpen && !this.busy) {
			event.preventDefault();
			event.stopPropagation();
			this.close();
		}
	};

	refreshIdentity(): void {
		const user = this.deps.getUser();
		const hasEmail =
			typeof user?.email === "string" && user.email.trim() !== "";
		this.emailField.hidden = hasEmail;
	}

	open(type?: TattleType): void {
		if (this.destroyed) return;
		this.mount();
		if (type) this.setType(type);
		if (this.isOpen || this.editor) return;
		this.isOpen = true;
		const active = document.activeElement;
		this.lastFocus = active === this.host ? null : active;
		this.refreshIdentity();
		// Reopened while closing after a sent report: start from a fresh form.
		if (!this.success.hidden) this.reset();
		this.showPanel();
		this.launcher?.setAttribute("aria-expanded", "true");
		this.launcher?.setAttribute("aria-label", this.t.closeLauncher);
		if (this.launcher) this.launcher.innerHTML = icons.close;
		const coarse =
			typeof matchMedia === "function" &&
			matchMedia("(pointer: coarse)").matches;
		requestAnimationFrame(() =>
			(coarse ? this.panel : this.message).focus({ preventScroll: true }),
		);
	}

	close(): void {
		if (this.editor) this.editor.cancel();
		if (!this.isOpen) return;
		this.isOpen = false;
		if (this.launcher) {
			this.launcher.setAttribute("aria-expanded", "false");
			this.launcher.setAttribute("aria-label", this.t.launcher);
			this.launcher.innerHTML = icons.bug;
		}
		const target = this.lastFocus;
		this.lastFocus = null;
		if (target instanceof HTMLElement && target.isConnected)
			target.focus({ preventScroll: true });
		else if (this.launcher && this.shadow.activeElement)
			this.launcher.focus({ preventScroll: true });
		if (this.panel.hidden) {
			this.hidePanel();
			return;
		}
		// While it animates out, the panel takes no clicks or focus.
		this.panel.inert = true;
		this.backdrop.inert = true;
		void this.animate("exit").then((done) => {
			if (done) this.hidePanel();
		});
	}

	private showPanel(): void {
		this.panel.inert = false;
		this.backdrop.inert = false;
		this.panel.hidden = false;
		this.backdrop.hidden = false;
		void this.animate("enter");
	}

	private hidePanel(): void {
		this.stopMotion();
		this.panel.hidden = true;
		this.backdrop.hidden = true;
		this.panel.inert = false;
		this.backdrop.inert = false;
		if (!this.success.hidden) this.reset();
	}

	/**
	 * Plays the panel's entrance or exit (`theme.animation`). Resolves to true
	 * once it has ended, false if something else interrupted it.
	 */
	private animate(phase: "enter" | "exit"): Promise<boolean> {
		this.stopMotion();
		const id = this.motionId;
		const motion = this.reducedMotionQuery?.matches
			? null
			: resolveMotion(this.theme.animation, phase, !!this.sheetQuery?.matches);
		if (!motion || typeof this.panel.animate !== "function")
			return Promise.resolve(true);
		const fill: FillMode = phase === "exit" ? "forwards" : "none";
		const fade = [{ opacity: 0 }, { opacity: 1 }];
		try {
			const panel = this.panel.animate(motion.keyframes, {
				duration: motion.duration,
				easing: motion.easing,
				fill,
			});
			this.motion = [
				panel,
				this.backdrop.animate(phase === "exit" ? fade.reverse() : fade, {
					duration: motion.duration,
					easing: "ease",
					fill,
				}),
			];
			return panel.finished.then(
				() => id === this.motionId,
				() => false,
			);
		} catch (error) {
			console.warn("[tattle] invalid theme.animation:", error);
			this.stopMotion();
			return Promise.resolve(true);
		}
	}

	private stopMotion(): void {
		this.motionId++;
		for (const animation of this.motion) animation.cancel();
		this.motion = [];
	}

	destroy(): void {
		if (this.destroyed) return;
		this.editor?.cancel();
		this.stopMotion();
		clearTimeout(this.successTimer);
		document.removeEventListener("keydown", this.onDocumentKey, true);
		this.darkQuery?.removeEventListener?.("change", this.applyTheme);
		this.host.remove();
		this.destroyed = true;
		this.isOpen = false;
	}

	private setType(type: TattleType): void {
		this.type = type;
		const t = this.t;
		this.typeButtons.bug.setAttribute("aria-pressed", String(type === "bug"));
		this.typeButtons.feature.setAttribute(
			"aria-pressed",
			String(type === "feature"),
		);
		this.shotSection.hidden = type !== "bug";
		this.messageLabel.textContent =
			type === "bug" ? t.messageLabelBug : t.messageLabelFeature;
		this.message.placeholder =
			type === "bug" ? t.placeholderBug : t.placeholderFeature;
		this.clearError();
	}

	private renderShot(): void {
		const shot = this.shot;
		this.shotRow.hidden = !shot;
		this.captureBtn.hidden = !!shot;
		if (shot) this.shotImg.src = shot.dataUrl;
		else this.shotImg.removeAttribute("src");
	}

	/** Hides everything at once for a screenshot, and shows it back. */
	private setHidden(hidden: boolean): void {
		if (hidden) {
			this.stopMotion();
			this.panel.hidden = true;
			this.backdrop.hidden = true;
		} else this.showPanel();
		if (this.launcher) this.launcher.hidden = hidden;
	}

	private async startCapture(): Promise<void> {
		if (this.busy) return;
		this.busy = "capturing";
		this.clearError();
		this.captureBtn.disabled = true;
		this.setHidden(true);
		let capture: Capture | null = null;
		try {
			await nextFrame();
			await nextFrame();
			capture = await captureViewport(this.host, this.config.maskSelectors);
		} catch (error) {
			console.warn("[tattle] screenshot failed:", error);
		} finally {
			this.busy = null;
			this.captureBtn.disabled = false;
		}
		if (this.destroyed) return;
		if (!this.isOpen) {
			// closed (e.g. via API) while capturing
			if (this.launcher) this.launcher.hidden = false;
			return;
		}
		if (!capture) {
			this.setHidden(false);
			this.showError(this.t.captureFailed);
			this.captureBtn.focus();
			return;
		}
		await this.annotate(capture, []);
	}

	private async annotate(capture: Capture, shapes: Shape[]): Promise<void> {
		this.setHidden(true);
		const editor = openAnnotator(
			this.root,
			capture,
			shapes,
			this.t,
			() => this.shadow.activeElement,
		);
		this.editor = editor;
		const result = await editor.result;
		this.editor = null;
		if (this.destroyed) return;
		if (result) {
			this.shot = { capture, shapes: result.shapes, dataUrl: result.dataUrl };
			this.renderShot();
		}
		if (this.launcher) this.launcher.hidden = false;
		if (!this.isOpen) return;
		this.setHidden(false);
		(this.shot ? this.editShotBtn : this.captureBtn).focus({
			preventScroll: true,
		});
	}

	private showError(message: string, field?: HTMLElement): void {
		this.error.textContent = message;
		this.error.hidden = false;
		if (field) {
			field.setAttribute("aria-invalid", "true");
			field.setAttribute("aria-describedby", "fb-error");
			field.focus();
		}
	}

	private clearError(): void {
		this.error.hidden = true;
		this.error.textContent = "";
		for (const field of [this.message, this.email]) {
			field.removeAttribute("aria-invalid");
			field.removeAttribute("aria-describedby");
		}
	}

	private setSending(sending: boolean): void {
		this.busy = sending ? "sending" : null;
		this.submit.disabled = sending;
		this.form.setAttribute("aria-busy", String(sending));
		this.submit.replaceChildren(
			...(sending
				? [
						h("span", { class: "fb-spinner", "aria-hidden": "true" }),
						this.t.sending,
					]
				: [this.t.send]),
		);
	}

	private async send(): Promise<void> {
		if (this.busy) return;
		const t = this.t;
		this.clearError();
		const text = this.message.value.trim();
		if (!text) return this.showError(t.emptyMessage, this.message);
		if (text.length > MAX_MESSAGE_LENGTH)
			return this.showError(t.tooLong, this.message);
		const typedEmail = this.emailField.hidden ? "" : this.email.value.trim();
		if (typedEmail && !EMAIL_RE.test(typedEmail))
			return this.showError(t.invalidEmail, this.email);

		this.setSending(true);
		try {
			const payload = buildPayload({
				projectKey: this.config.projectKey,
				type: this.type,
				message: text,
				screenshot: this.type === "bug" ? this.shot?.dataUrl : undefined,
				email: typedEmail || undefined,
				user: this.deps.getUser(),
				context: this.deps.getContext(),
				release: this.config.release,
			});
			await sendPayload(this.config.apiUrl, payload);
		} catch (error) {
			this.setSending(false);
			if (this.destroyed) return;
			const message =
				error instanceof IngestError
					? error.status === 0
						? t.networkError
						: error.message || t.genericError
					: t.genericError;
			this.showError(message);
			this.submit.focus();
			return;
		}
		this.setSending(false);
		if (this.destroyed) return;
		this.form.hidden = true;
		this.success.hidden = false;
		this.panel.focus({ preventScroll: true });
		clearTimeout(this.successTimer);
		this.successTimer = setTimeout(() => this.close(), SUCCESS_CLOSE_MS);
	}

	private reset(): void {
		clearTimeout(this.successTimer);
		this.form.reset();
		this.message.value = "";
		this.email.value = "";
		this.count.textContent = `0 / ${MAX_MESSAGE_LENGTH}`;
		this.shot = null;
		this.renderShot();
		this.clearError();
		this.setType("bug");
		this.form.hidden = false;
		this.success.hidden = true;
	}
}
