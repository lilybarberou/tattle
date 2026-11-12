export const styles = /* css */ `
:host { all: initial; }
/* Colors, font, radius and shadow come from --fb-* variables set by theme.ts. */
.fb-root {
	--fb-ring: color-mix(in srgb, var(--fb-accent) 30%, transparent);
	--fb-safe-b: env(safe-area-inset-bottom, 0px);
	--fb-safe-l: env(safe-area-inset-left, 0px);
	--fb-safe-r: env(safe-area-inset-right, 0px);
	font-family: var(--fb-font);
	font-size: 14px;
	line-height: 1.45;
	color: var(--fb-fg);
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	text-align: left;
	direction: ltr;
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
svg { display: block; flex-shrink: 0; }
button, input, textarea { font: inherit; color: inherit; margin: 0; }
button { cursor: pointer; background: none; border: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
button:disabled { cursor: not-allowed; opacity: .45; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--fb-accent); outline-offset: 2px; }
.fb-panel:focus, .fb-editor:focus { outline: none; } /* programmatic focus targets */

/* Launcher */
.fb-launcher {
	position: fixed;
	bottom: calc(20px + var(--fb-safe-b));
	right: calc(20px + var(--fb-safe-r));
	width: 52px;
	height: 52px;
	border-radius: 50%;
	display: grid;
	place-items: center;
	background: var(--fb-accent);
	color: var(--fb-accent-fg);
	box-shadow: 0 8px 24px -6px color-mix(in srgb, var(--fb-accent) 60%, rgba(0, 0, 0, .5)), 0 2px 6px rgba(0, 0, 0, .15);
	transition: transform .18s ease, box-shadow .18s ease;
}
.fb-launcher svg { width: 24px; height: 24px; }
.fb-launcher:hover { transform: scale(1.06); }
.fb-launcher:active { transform: scale(.96); }
.fb-left .fb-launcher { right: auto; left: calc(20px + var(--fb-safe-l)); }

/* Panel */
.fb-panel {
	position: fixed;
	bottom: calc(84px + var(--fb-safe-b));
	right: calc(20px + var(--fb-safe-r));
	width: 380px;
	max-width: calc(100vw - 32px);
	max-height: min(680px, calc(100vh - 110px));
	display: flex;
	flex-direction: column;
	background: var(--fb-bg);
	border: 1px solid var(--fb-border);
	border-radius: calc(var(--fb-radius) + 6px);
	box-shadow: var(--fb-shadow);
	overflow: hidden;
	transform-origin: bottom right;
	animation: fb-pop .18s cubic-bezier(.2, .8, .3, 1);
}
.fb-left .fb-panel { right: auto; left: calc(20px + var(--fb-safe-l)); transform-origin: bottom left; }
.fb-no-button .fb-panel { bottom: calc(20px + var(--fb-safe-b)); }
@keyframes fb-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
.fb-backdrop { display: none; }

.fb-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 14px 10px 18px;
}
.fb-title { font-size: 15px; font-weight: 650; margin: 0; letter-spacing: -.01em; }
.fb-icon-btn {
	width: 32px;
	height: 32px;
	border-radius: max(0px, calc(var(--fb-btn-radius) - 1px));
	display: grid;
	place-items: center;
	color: var(--fb-muted);
}
.fb-icon-btn:hover { background: var(--fb-subtle); color: var(--fb-fg); }
.fb-body { padding: 4px 18px 18px; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 14px; }

/* Type switch */
.fb-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--fb-subtle); border-radius: calc(var(--fb-btn-radius) + 2px); }
.fb-seg button {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
	min-height: 38px;
	padding: 6px 8px;
	border-radius: max(0px, calc(var(--fb-btn-radius) - 1px));
	font-size: 13px;
	font-weight: 550;
	color: var(--fb-muted);
	transition: background .15s, color .15s;
}
.fb-seg button svg { width: 17px; height: 17px; }
.fb-seg button:hover { color: var(--fb-fg); }
.fb-seg button[aria-pressed="true"] { background: var(--fb-bg); color: var(--fb-fg); box-shadow: 0 1px 3px rgba(0, 0, 0, .12), 0 0 0 1px var(--fb-border); }
.fb-seg button[aria-pressed="true"] svg { color: var(--fb-accent); }

/* Fields */
.fb-field { display: flex; flex-direction: column; gap: 6px; }
.fb-label { font-size: 13px; font-weight: 600; }
.fb-hint { font-size: 12px; color: var(--fb-muted); margin: 0; }
.fb-input, .fb-textarea {
	width: 100%;
	padding: 10px 12px;
	background: var(--fb-bg);
	border: 1px solid var(--fb-border);
	border-radius: var(--fb-radius);
	transition: border-color .15s, box-shadow .15s;
}
.fb-textarea { min-height: 120px; resize: vertical; display: block; }
.fb-input::placeholder, .fb-textarea::placeholder { color: var(--fb-muted); opacity: .85; }
.fb-input:focus-visible, .fb-textarea:focus-visible, .fb-input:focus, .fb-textarea:focus {
	outline: none;
	border-color: var(--fb-accent);
	box-shadow: 0 0 0 3px var(--fb-ring);
}
.fb-input[aria-invalid="true"], .fb-textarea[aria-invalid="true"] { border-color: var(--fb-danger); }
.fb-count { font-size: 11px; color: var(--fb-muted); text-align: right; font-variant-numeric: tabular-nums; }

/* Screenshot */
.fb-capture {
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 44px;
	padding: 10px 12px;
	border: 1.5px dashed var(--fb-border);
	border-radius: var(--fb-radius);
	font-weight: 550;
	color: var(--fb-fg);
	transition: border-color .15s, background .15s;
}
.fb-capture:hover { border-color: var(--fb-accent); background: color-mix(in srgb, var(--fb-accent) 6%, transparent); }
.fb-capture svg { color: var(--fb-accent); }
.fb-shot { display: flex; align-items: center; gap: 12px; padding: 8px; border: 1px solid var(--fb-border); border-radius: calc(var(--fb-radius) + 2px); }
.fb-shot img { width: 104px; height: 64px; object-fit: cover; object-position: top; border-radius: max(0px, calc(var(--fb-radius) - 3px)); border: 1px solid var(--fb-border); background: var(--fb-subtle); flex-shrink: 0; }
.fb-shot-actions { display: flex; flex-wrap: wrap; gap: 6px; }

/* Buttons */
.fb-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 36px;
	padding: 7px 14px;
	border-radius: var(--fb-btn-radius);
	font-weight: 600;
	font-size: 13.5px;
	white-space: nowrap;
	transition: background .15s, filter .15s, transform .1s;
}
.fb-btn svg { width: 17px; height: 17px; }
.fb-btn:active:not(:disabled) { transform: scale(.98); }
.fb-btn-primary { background: var(--fb-accent); color: var(--fb-accent-fg); }
.fb-btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
.fb-btn-ghost { background: var(--fb-subtle); color: var(--fb-fg); }
.fb-btn-ghost:hover:not(:disabled) { filter: brightness(.96); }
.fb-btn-sm { min-height: 30px; padding: 4px 10px; font-size: 12.5px; }
.fb-btn-sm svg { width: 15px; height: 15px; }
.fb-btn-danger { color: var(--fb-danger); }
.fb-submit { width: 100%; min-height: 42px; font-size: 14px; }
.fb-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: fb-spin .7s linear infinite; }
@keyframes fb-spin { to { transform: rotate(360deg); } }

.fb-error {
	margin: 0;
	padding: 9px 12px;
	border-radius: max(0px, calc(var(--fb-radius) - 1px));
	font-size: 13px;
	color: var(--fb-danger);
	background: var(--fb-danger-bg);
}

/* Success */
.fb-success { padding: 36px 24px 40px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
.fb-success-icon { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--fb-accent) 14%, transparent); color: var(--fb-accent); }
.fb-success-icon svg { width: 26px; height: 26px; }
.fb-success p { margin: 0; font-size: 15px; font-weight: 600; }

/* Narrow screens: bottom sheet */
@media (max-width: 639.98px) {
	.fb-backdrop { display: block; position: fixed; inset: 0; background: var(--fb-backdrop); animation: fb-fade .2s ease; }
	.fb-panel, .fb-left .fb-panel, .fb-no-button .fb-panel {
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		max-width: none;
		max-height: 92vh;
		max-height: 92dvh;
		border-radius: calc(var(--fb-radius) + 8px) calc(var(--fb-radius) + 8px) 0 0;
		border-bottom: 0;
		padding-bottom: var(--fb-safe-b);
		transform-origin: bottom center;
		animation: fb-sheet .24s cubic-bezier(.2, .8, .3, 1);
	}
	.fb-header::before {
		content: "";
		position: absolute;
		top: 6px;
		left: 50%;
		width: 36px;
		height: 4px;
		margin-left: -18px;
		border-radius: 2px;
		background: var(--fb-border);
	}
	.fb-header { position: relative; padding-top: 18px; }
	.fb-input, .fb-textarea { font-size: 16px; } /* avoid iOS zoom on focus */
}
@keyframes fb-sheet { from { transform: translateY(100%); } }
@keyframes fb-fade { from { opacity: 0; } }

/* Annotation editor */
.fb-editor { position: fixed; inset: 0; background: rgba(9, 9, 11, .82); outline: none; touch-action: none; animation: fb-fade .15s ease; }
.fb-editor-canvas {
	position: absolute;
	cursor: crosshair;
	touch-action: none;
	box-shadow: 0 0 0 2px var(--fb-accent), 0 10px 40px rgba(0, 0, 0, .5);
}
.fb-toolbar {
	position: absolute;
	left: 50%;
	bottom: calc(16px + var(--fb-safe-b));
	transform: translateX(-50%);
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: max-content;
	max-width: calc(100vw - 16px);
	padding: 6px;
	border-radius: calc(var(--fb-btn-radius) + 5px);
	background: #18181b;
	color: #f4f4f5;
	box-shadow: 0 12px 32px rgba(0, 0, 0, .45), 0 0 0 1px rgba(255, 255, 255, .08);
	--fb-subtle: #2c2c33;
	--fb-fg: #f4f4f5;
}
.fb-toolbar :focus-visible { outline-color: #ffffff; }
.fb-toolgroup { display: flex; gap: 2px; align-items: center; }
.fb-sep { width: 1px; height: 24px; background: rgba(255, 255, 255, .14); }
.fb-tool { width: 38px; height: 38px; border-radius: var(--fb-btn-radius); display: grid; place-items: center; color: #d4d4d8; }
.fb-tool:hover:not(:disabled) { background: rgba(255, 255, 255, .09); color: #fff; }
.fb-tool[aria-pressed="true"] { background: var(--fb-accent); color: var(--fb-accent-fg); }
.fb-toolbar .fb-btn { min-height: 38px; }
@media (max-width: 639.98px) {
	.fb-sep { display: none; }
	.fb-tool { width: 40px; height: 40px; }
}

@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
