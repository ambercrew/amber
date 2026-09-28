use chrono::NaiveDate;
use serde::Serialize;

use crate::statistics::value_objects::daily_activity::DailyActivity;
use crate::statistics::value_objects::daily_forecast::DailyForecast;
use crate::statistics::value_objects::home_statistics::HomeStatistics;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeStatisticsResponseDto {
    /// Distinct elements of each type reviewed today.
    pub learning_asset_count: i64,
    pub extract_count: i64,
    pub card_count: i64,
    pub today_study_duration_ms: u64,
    pub daily_activity: Vec<DailyActivityDto>,
    pub daily_forecast: Vec<DailyForecastDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityDto {
    pub date: NaiveDate,
    pub reviews: u32,
    pub duration_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyForecastDto {
    pub date: NaiveDate,
    pub reviews: u32,
}

impl From<DailyForecast> for DailyForecastDto {
    fn from(forecast: DailyForecast) -> Self {
        DailyForecastDto {
            date: forecast.date,
            reviews: forecast.reviews,
        }
    }
}

impl From<DailyActivity> for DailyActivityDto {
    fn from(activity: DailyActivity) -> Self {
        DailyActivityDto {
            date: activity.date,
            reviews: activity.reviews,
            duration_ms: activity.duration_ms,
        }
    }
}

impl From<HomeStatistics> for HomeStatisticsResponseDto {
    fn from(statistics: HomeStatistics) -> Self {
        HomeStatisticsResponseDto {
            learning_asset_count: statistics.element_counts.learning_assets,
            extract_count: statistics.element_counts.extracts,
            card_count: statistics.element_counts.cards,
            today_study_duration_ms: statistics.today_study_duration_ms,
            daily_activity: statistics
                .daily_activity
                .into_iter()
                .map(DailyActivityDto::from)
                .collect(),
            daily_forecast: statistics
                .daily_forecast
                .into_iter()
                .map(DailyForecastDto::from)
                .collect(),
        }
    }
}
