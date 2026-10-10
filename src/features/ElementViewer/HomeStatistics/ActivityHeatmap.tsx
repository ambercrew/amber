import { Heatmap } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import dayjs from "dayjs";
import { ComponentProps } from "react";
import {
	DailyActivityDto,
	DailyForecastDto,
} from "../../../api/statistics/dto/homeStatisticsDto";
import { formatStudyDuration } from "../../../utils/formatStudyDuration";
import { heatmapLevel } from "../../../utils/heatmapLevel";
import { heatmapYearLayout } from "../../../utils/heatmapRectSize";

/** Strength of each heatmap shade, lightest first; any length works. */
const SHADE_PERCENTS = [20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Shades of `color` mixed into the empty-day fill, so even the lightest stands
 * out from an empty day (mixing with transparent would sink toward the page). */
function shadesOf(color: string): string[] {
	return SHADE_PERCENTS.map(
		percent =>
			`color-mix(in srgb, ${color} ${percent}%, var(--heatmap-empty-rect-bg))`,
	);
}

const HEATMAP_COLORS = shadesOf("var(--mantine-primary-color-filled)");

// Gray shades for reviews due on future days, like Anki's forecast.
const FORECAST_COLORS = shadesOf("var(--mantine-color-dimmed)");

const HEATMAP_GAP = 3;

/** Below this the squares get too small to hover, so the heatmap wraps instead. */
const MIN_HEATMAP_RECT_SIZE = 8;

/** This year's daily reviews, with future days shaded by reviews due; wraps
 * into rows of whole months when the squares would get too small. */
export default function ActivityHeatmap({
	dailyActivity,
	dailyForecast,
}: {
	dailyActivity: DailyActivityDto[];
	dailyForecast: DailyForecastDto[];
}) {
	const { ref, width } = useElementSize();
	const { rows, rectSize } = heatmapYearLayout(
		dayjs().year(),
		width,
		HEATMAP_GAP,
		MIN_HEATMAP_RECT_SIZE,
	);
	const data = Object.fromEntries(
		dailyActivity.map(day => [day.date, day.reviews]),
	);
	const activityByDate = new Map(dailyActivity.map(day => [day.date, day]));
	const forecastByDate = new Map(
		dailyForecast.map(day => [day.date, day.reviews]),
	);
	const maxActivity = Math.max(0, ...Object.values(data));
	const maxForecast = Math.max(0, ...forecastByDate.values());

	return (
		<Stack ref={ref} gap="xs" style={{ overflowX: "auto" }}>
			{width > 0 &&
				rows.map(row => (
					<Heatmap
						key={row.startDate}
						data={data}
						// Scale from 0 like the forecast; Mantine's default starts at the least active day.
						domain={[0, maxActivity]}
						startDate={row.startDate}
						endDate={row.endDate}
						rectSize={rectSize}
						gap={HEATMAP_GAP}
						rectRadius={2}
						colors={HEATMAP_COLORS}
						withOutsideDates={false}
						withMonthLabels
						withWeekdayLabels
						withTooltip
						getRectProps={({ date }) => {
							const due = forecastByDate.get(date);
							if (!due || date in data) return {};
							const level = heatmapLevel(
								due,
								maxForecast,
								FORECAST_COLORS.length,
							);
							// Clearing data-empty lets the fill win over the empty-day style.
							return {
								fill: FORECAST_COLORS[level],
								"data-empty": undefined,
							} as ComponentProps<"rect">;
						}}
						getTooltipLabel={({ date }) =>
							dayjs(date).isAfter(dayjs(), "day")
								? forecastLabel(date, forecastByDate.get(date))
								: activityLabel(date, activityByDate.get(date))
						}
					/>
				))}
		</Stack>
	);
}

function activityLabel(
	date: string,
	day: DailyActivityDto | undefined,
): string {
	const formattedDate = dayjs(date).format("MMM D, YYYY");
	// Today always shows its study time, even before any review.
	const isToday = dayjs(date).isSame(dayjs(), "day");
	if (!day && !isToday) return `${formattedDate} – No reviews`;

	const count = day?.reviews ?? 0;
	const reviews = `${count} review${count === 1 ? "" : "s"}`;
	return `${formattedDate} – ${reviews}, ${formatStudyDuration(day?.durationMs ?? 0)}`;
}

function forecastLabel(date: string, due: number | undefined): string {
	const formattedDate = dayjs(date).format("MMM D, YYYY");
	if (!due) return `${formattedDate} – No reviews due`;
	return `${formattedDate} – ${due} review${due === 1 ? "" : "s"} due`;
}
