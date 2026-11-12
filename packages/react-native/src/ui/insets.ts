import { createContext, useContext } from "react";
import { Dimensions, Platform, StatusBar } from "react-native";
import { type Insets, safeAreaContext } from "../optional";

const safeArea = safeAreaContext();
const Fallback = createContext<Insets | null>(null);
const Context = safeArea?.SafeAreaInsetsContext ?? Fallback;

/** A guess for apps without react-native-safe-area-context. */
function estimate(): Insets {
	if (Platform.OS === "android")
		return {
			top: StatusBar.currentHeight ?? 24,
			bottom: 24,
			left: 0,
			right: 0,
		};
	const { width, height } = Dimensions.get("window");
	const notched = Platform.OS === "ios" && Math.max(width, height) >= 812;
	return notched
		? { top: 50, bottom: 34, left: 0, right: 0 }
		: { top: 20, bottom: 0, left: 0, right: 0 };
}

/**
 * Safe area insets from react-native-safe-area-context when the app uses it
 * (its provider, else the window's initial metrics), or an estimate.
 */
export function useInsets(): Insets {
	const fromProvider = useContext(Context);
	return fromProvider ?? safeArea?.initialWindowMetrics?.insets ?? estimate();
}
