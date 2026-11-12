// Inline 24×24 stroke icons (currentColor).
const svg = (body: string) =>
	`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
	bug: svg(
		'<path d="M8 2l1.9 1.9M16 2l-1.9 1.9"/><path d="M9 7.1V6a3 3 0 0 1 6 0v1.1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9M6.5 9H3M21 9h-3.5M6 13H2M22 13h-4M6.5 17.5 3 20M17.5 17.5 21 20"/>',
	),
	idea: svg(
		'<path d="M9 18h6M10 22h4"/><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A5.9 5.9 0 0 0 18 7.6a6 6 0 0 0-12 0c0 1.5.5 2.9 1.5 3.9.7.8 1.3 1.5 1.4 2.5"/>',
	),
	close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
	camera: svg(
		'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
	),
	edit: svg(
		'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
	),
	trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
	check: svg('<path d="M20 6 9 17l-5-5"/>'),
	back: svg('<path d="m15 18-6-6 6-6"/>'),
	chat: svg(
		'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
	),
	rect: svg('<rect x="3" y="5" width="18" height="14" rx="2"/>'),
	ellipse: svg('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
	arrow: svg('<path d="M5 19 19 5M9 5h10v10"/>'),
	pen: svg(
		'<path d="M3 21c3-1 4-3 6-5l9-9a2.1 2.1 0 0 0-3-3l-9 9c-2 2-4 3-5 6"/>',
	),
	blur: svg(
		'<rect x="3" y="3" width="6" height="6" fill="currentColor" opacity=".9"/><rect x="9" y="9" width="6" height="6" fill="currentColor" opacity=".5"/><rect x="15" y="3" width="6" height="6" fill="currentColor" opacity=".3"/><rect x="3" y="15" width="6" height="6" fill="currentColor" opacity=".4"/><rect x="15" y="15" width="6" height="6" fill="currentColor" opacity=".8"/>',
	),
	undo: svg(
		'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
	),
	clear: svg(
		'<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7M5 11l9 9"/>',
	),
};
