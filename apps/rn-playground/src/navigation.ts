import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type Routes = {
	Home: undefined;
	Checkout: undefined;
	Account: undefined;
};

export type ScreenProps<Name extends keyof Routes> = NativeStackScreenProps<
	Routes,
	Name
>;
