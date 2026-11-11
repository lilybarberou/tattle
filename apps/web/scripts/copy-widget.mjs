// Copies the built widget into public/ so the server serves it at /widget.js.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
	new URL("../../../packages/widget/dist/widget.iife.js", import.meta.url),
);
const target = fileURLToPath(new URL("../public/widget.js", import.meta.url));

if (existsSync(source)) {
	copyFileSync(source, target);
	console.log("widget.js copied to public/");
} else {
	console.warn(
		"packages/widget is not built yet: run `pnpm --filter @tattle/widget build`",
	);
}
