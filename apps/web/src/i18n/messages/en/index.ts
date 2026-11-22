import { app } from "./app";
import { auth } from "./auth";
import { chat } from "./chat";
import { common } from "./common";
import { emails } from "./emails";
import { errors } from "./errors";
import { issues } from "./issues";
import { overview } from "./overview";
import { publicPages } from "./publicPages";
import { settings } from "./settings";
import { time } from "./time";
import { triage } from "./triage";
import { workspace } from "./workspace";

/** The English catalogue: the reference every other language must match. */
export const en = {
	common,
	time,
	app,
	triage,
	issues,
	settings,
	workspace,
	overview,
	auth,
	publicPages,
	emails,
	chat,
	errors,
};

export type Messages = typeof en;
