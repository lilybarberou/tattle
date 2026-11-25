// Metro for the playground, inside the pnpm workspace.
//
// - `@tattle/react-native` resolves to the SDK's TypeScript sources, so an edit
//   in packages/react-native reloads the app without building or packing.
// - Every package the SDK imports (react, react-native, react-native-svg…)
//   resolves from this app, as it would once installed in a real app. The SDK's
//   own devDependencies (another React, for its tests) are never bundled: two
//   copies of React break hooks.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sdkRoot = path.resolve(projectRoot, "../../packages/react-native");
const sdkSources = path.join(sdkRoot, "src");
const sdkEntry = path.join(sdkSources, "index.ts");
// Where the SDK's imports are resolved from: a file of this app.
const appOrigin = path.join(projectRoot, "package.json");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), sdkRoot])];

const isPackage = (name) => !name.startsWith(".") && !path.isAbsolute(name);

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "@tattle/react-native")
		return { type: "sourceFile", filePath: sdkEntry };
	if (
		isPackage(moduleName) &&
		context.originModulePath.startsWith(sdkSources + path.sep)
	)
		return context.resolveRequest(
			{ ...context, originModulePath: appOrigin },
			moduleName,
			platform,
		);
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
