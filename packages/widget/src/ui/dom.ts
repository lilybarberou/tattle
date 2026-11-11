type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

/** Tiny element factory. `html` attr sets innerHTML (only used for static SVG icons). */
export function h<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Attrs = {},
	...children: Child[]
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs)) {
		if (value === undefined || value === null || value === false) continue;
		if (key === "html") el.innerHTML = String(value);
		else el.setAttribute(key, value === true ? "" : String(value));
	}
	for (const child of children) {
		if (child === null || child === undefined || child === false) continue;
		el.append(child);
	}
	return el;
}

/** Icon-only button with an accessible label. */
export function iconButton(
	icon: string,
	label: string,
	className: string,
	attrs: Attrs = {},
): HTMLButtonElement {
	return h("button", {
		type: "button",
		class: className,
		"aria-label": label,
		title: label,
		html: icon,
		...attrs,
	});
}

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.hidden && el.getClientRects().length > 0,
	);
}

/** Keeps Tab / Shift+Tab inside `container`. `active` is the shadow root's active element. */
export function trapTab(
	event: KeyboardEvent,
	container: HTMLElement,
	active: Element | null,
): void {
	if (event.key !== "Tab") return;
	const items = focusables(container);
	if (!items.length) {
		event.preventDefault();
		return;
	}
	const first = items[0] as HTMLElement;
	const last = items[items.length - 1] as HTMLElement;
	const inside = !!active && container.contains(active);
	if (event.shiftKey && (active === first || !inside)) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && (active === last || !inside)) {
		event.preventDefault();
		first.focus();
	}
}
