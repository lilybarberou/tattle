import type { time as en } from "../en/time";

export const time: typeof en = {
	justNow: "à l'instant",
	now: "maintenant",
	minutes: (count) => `${count} min`,
	hours: (count) => `${count} h`,
	yesterday: "Hier",
};
