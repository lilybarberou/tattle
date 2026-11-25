// The SDK records console logs and requests from the moment it is imported:
// import it before anything else, as the README asks of apps.
import "@tattlehq/react-native";
import { registerRootComponent } from "expo";
import { App } from "./App";

registerRootComponent(App);
