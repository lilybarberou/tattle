import { createContext, useContext } from "react";
import type { NewIssueDefaults } from "./new-issue-dialog";

export type AppActions = {
	newIssue: (defaults?: NewIssueDefaults) => void;
	openSearch: () => void;
};

export const AppActionsContext = createContext<AppActions>({
	newIssue: () => {},
	openSearch: () => {},
});

/** Opens the app-wide dialogs (new issue, search) from any screen. */
export const useAppActions = () => useContext(AppActionsContext);
