import { useState } from "react";
import { cn } from "#/lib/utils";

export type ReportDay = { date: string; bugs: number; features: number };

const SERIES = [
	{ key: "bugs", label: "Bugs", swatch: "bg-series-bug" },
	{ key: "features", label: "Feature requests", swatch: "bg-series-feature" },
] as const;

// Days are UTC days (YYYY-MM-DD): format them in UTC so the server render and
// the browser agree.
const dayFormat = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const longDayFormat = new Intl.DateTimeFormat("en", {
	weekday: "short",
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const describe = (day: ReportDay | undefined) =>
	day
		? `${longDayFormat.format(asDate(day.date))}: ${day.bugs} ${day.bugs === 1 ? "bug" : "bugs"}, ${day.features} ${day.features === 1 ? "feature request" : "feature requests"}`
		: undefined;

/** The smallest of 1, 2, 5 × 10ⁿ at or above `value`, so the axis reads in round numbers. */
const niceCeil = (value: number) => {
	if (value <= 1) return 1;
	const power = 10 ** Math.floor(Math.log10(value));
	for (const step of [1, 2, 5, 10]) {
		if (step * power >= value) return step * power;
	}
	return 10 * power;
};

/**
 * Reports per day as stacked columns: bugs at the base, feature requests on
 * top. Hover or arrow keys show a day; a hidden table carries every value.
 */
export function ReportsChart({ days }: { days: ReportDay[] }) {
	const [active, setActive] = useState<number | null>(null);
	const top = niceCeil(Math.max(0, ...days.map((d) => d.bugs + d.features)));
	const ticks = top >= 2 && top % 2 === 0 ? [top, top / 2] : [top];
	const day = active === null ? null : days[active];
	const first = days[0];
	const last = days.at(-1);

	return (
		<figure className="space-y-3">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{SERIES.map((s) => (
					<span key={s.key} className="flex items-center gap-1.5">
						<span
							aria-hidden
							className={cn("size-2 rounded-[2px]", s.swatch)}
						/>
						{s.label}
					</span>
				))}
			</div>

			<div className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
				{/* Y axis: round numbers, one hairline each. */}
				<div className="num relative h-40 w-5 text-right text-[11px] text-muted-foreground">
					{[...ticks, 0].map((tick) => (
						<span
							key={tick}
							className="absolute right-0 -translate-y-1/2"
							style={{ top: `${100 - (tick / top) * 100}%` }}
						>
							{tick}
						</span>
					))}
				</div>
				{/* One tab stop: the arrow keys move from day to day, like a slider. */}
				<div
					tabIndex={0}
					role="slider"
					aria-label="Reports per day, last 30 days"
					aria-valuemin={0}
					aria-valuemax={days.length - 1}
					aria-valuenow={active ?? days.length - 1}
					aria-valuetext={describe(day ?? last)}
					className="relative h-40 rounded-sm outline-offset-4"
					onPointerLeave={() => setActive(null)}
					onFocus={() => setActive((i) => i ?? days.length - 1)}
					onBlur={() => setActive(null)}
					onKeyDown={(event) => {
						if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
							event.preventDefault();
							const step = event.key === "ArrowLeft" ? -1 : 1;
							setActive((i) =>
								Math.min(
									days.length - 1,
									Math.max(0, (i ?? days.length - 1) + step),
								),
							);
						}
					}}
				>
					{ticks.map((tick) => (
						<span
							key={tick}
							aria-hidden
							className="absolute inset-x-0 border-t border-rule"
							style={{ top: `${100 - (tick / top) * 100}%` }}
						/>
					))}
					<span
						aria-hidden
						className="absolute inset-x-0 bottom-0 border-t border-border"
					/>
					<div aria-hidden className="absolute inset-0 flex">
						{days.map((d, index) => (
							<div
								key={d.date}
								onPointerEnter={() => setActive(index)}
								className={cn(
									"flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-[2px] rounded-sm px-[1px] sm:px-[2px]",
									active === index && "bg-raised",
								)}
							>
								{d.bugs > 0 && (
									<span
										className={cn(
											"w-full max-w-6 bg-series-bug",
											d.features === 0 && "rounded-t-[4px]",
										)}
										style={{ height: `${(d.bugs / top) * 100}%` }}
									/>
								)}
								{d.features > 0 && (
									<span
										className="w-full max-w-6 rounded-t-[4px] bg-series-feature"
										style={{ height: `${(d.features / top) * 100}%` }}
									/>
								)}
							</div>
						))}
					</div>

					{day && active !== null && (
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-3 py-2 text-xs whitespace-nowrap shadow-md",
								active < days.length / 2 ? "ml-3" : "-ml-3 -translate-x-full",
							)}
							style={{ left: `${((active + 0.5) / days.length) * 100}%` }}
						>
							<p className="mb-1.5 text-muted-foreground">
								{longDayFormat.format(asDate(day.date))}
							</p>
							{SERIES.map((s) => (
								<p key={s.key} className="flex items-center gap-2">
									<span
										aria-hidden
										className={cn("h-0.5 w-2.5 rounded-full", s.swatch)}
									/>
									<span className="num font-semibold text-ink">
										{day[s.key]}
									</span>
									<span className="text-muted-foreground">{s.label}</span>
								</p>
							))}
						</div>
					)}
				</div>

				<span />
				<div className="num mt-1.5 flex justify-between text-[11px] text-muted-foreground">
					<span>{first && dayFormat.format(asDate(first.date))}</span>
					<span>{last && dayFormat.format(asDate(last.date))}</span>
				</div>
			</div>

			<table className="sr-only">
				<caption>Reports per day</caption>
				<thead>
					<tr>
						<th scope="col">Day</th>
						{SERIES.map((s) => (
							<th key={s.key} scope="col">
								{s.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{days.map((d) => (
						<tr key={d.date}>
							<th scope="row">{dayFormat.format(asDate(d.date))}</th>
							<td>{d.bugs}</td>
							<td>{d.features}</td>
						</tr>
					))}
				</tbody>
			</table>
		</figure>
	);
}
