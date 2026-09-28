export interface DailyActivityDto {
	date: string;
	reviews: number;
	durationMs: number;
}

export interface DailyForecastDto {
	date: string;
	reviews: number;
}

export interface HomeStatisticsDto {
	/** Distinct learning assets reviewed today; likewise for extracts and cards. */
	learningAssetCount: number;
	extractCount: number;
	cardCount: number;
	todayStudyDurationMs: number;
	dailyActivity: DailyActivityDto[];
	dailyForecast: DailyForecastDto[];
}
