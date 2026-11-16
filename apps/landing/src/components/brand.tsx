/** The product mark: a speech bubble whose tail is a pin (apps/web/src/components/brand.tsx). */
export function BrandMark({
	size = 20,
	hole = "var(--night)",
}: {
	size?: number;
	hole?: string;
}) {
	return (
		<svg
			viewBox="0 0 20 20"
			width={size}
			height={size}
			aria-hidden="true"
			className="mark"
		>
			<path
				d="M4 2.5h12A2.5 2.5 0 0 1 18.5 5v7.5A2.5 2.5 0 0 1 16 15h-6.2L6 18.2V15H4a2.5 2.5 0 0 1-2.5-2.5V5A2.5 2.5 0 0 1 4 2.5Z"
				fill="currentColor"
			/>
			<circle cx="10" cy="8.75" r="2.4" fill={hole} />
		</svg>
	);
}

export const REPO = "https://github.com/lilybarberou/tattle";
export const DOCS = {
	selfHosting: `${REPO}/blob/main/docs/SELF-HOSTING.md`,
	ingest: `${REPO}/blob/main/docs/INGEST-API.md`,
	widget: `${REPO}/blob/main/packages/widget/README.md`,
	reactNative: `${REPO}/blob/main/packages/react-native/README.md`,
	mcp: `${REPO}#connect-an-agent`,
	releases: `${REPO}/releases`,
	issues: `${REPO}/issues`,
	licence: `${REPO}/blob/main/LICENSE`,
};
