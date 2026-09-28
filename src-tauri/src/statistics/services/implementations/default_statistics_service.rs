use std::sync::Arc;

use async_trait::async_trait;
use chrono::{Datelike, Days, Local, NaiveDate};
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::statistics::repositories::statistics_repository::StatisticsRepository;
use crate::statistics::services::statistics_service::StatisticsService;
use crate::statistics::value_objects::daily_activity::DailyActivity;
use crate::statistics::value_objects::daily_forecast::DailyForecast;
use crate::statistics::value_objects::element_counts::ElementCounts;
use crate::statistics::value_objects::home_statistics::HomeStatistics;
use crate::study::utils::day_boundary::start_of_day_utc;

/// Caps a single review's time so an element left open overnight doesn't count as study.
const MAX_COUNTED_REVIEW_DURATION_MS: u64 = 60 * 60 * 1000;

#[derive(ScopeInjectable)]
pub struct DefaultStatisticsService {
    statistics_repository: Arc<dyn StatisticsRepository>,
}

#[async_trait]
impl StatisticsService for DefaultStatisticsService {
    async fn get_home_statistics(&self) -> Result<HomeStatistics, RepositoryError> {
        let today = Local::now().date_naive();
        let first_day = today.with_ordinal(1).unwrap_or(today);
        let tomorrow = today.checked_add_days(Days::new(1)).unwrap_or(today);
        let next_year = NaiveDate::from_yo_opt(today.year() + 1, 1).unwrap_or(tomorrow);

        let element_counts = self
            .statistics_repository
            .count_reviewed_elements(today)
            .await?;
        let daily_activity = self
            .statistics_repository
            .get_daily_activity_since(start_of_day_utc(first_day), MAX_COUNTED_REVIEW_DURATION_MS)
            .await?;
        let daily_forecast = self
            .statistics_repository
            .get_daily_forecast(start_of_day_utc(tomorrow), start_of_day_utc(next_year))
            .await?;

        Ok(summarize(
            daily_activity,
            daily_forecast,
            today,
            element_counts,
        ))
    }
}

fn summarize(
    daily_activity: Vec<DailyActivity>,
    daily_forecast: Vec<DailyForecast>,
    today: NaiveDate,
    element_counts: ElementCounts,
) -> HomeStatistics {
    let today_study_duration_ms = daily_activity
        .iter()
        .find(|day| day.date == today)
        .map_or(0, |day| day.duration_ms);

    HomeStatistics {
        element_counts,
        today_study_duration_ms,
        daily_activity,
        daily_forecast,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(date: &str, duration_ms: u64) -> DailyActivity {
        DailyActivity {
            date: date.parse().unwrap(),
            reviews: 1,
            duration_ms,
        }
    }

    #[test]
    fn summarize_activity_today_and_earlier_today_duration_only_counts_today() {
        // Arrange

        let daily_activity = vec![day("2026-09-26", 5_000), day("2026-09-27", 7_000)];
        let counts = ElementCounts {
            learning_assets: 1,
            extracts: 2,
            cards: 3,
        };

        // Act

        let actual = summarize(
            daily_activity,
            Vec::new(),
            "2026-09-27".parse().unwrap(),
            counts,
        );

        // Assert

        assert_eq!(7_000, actual.today_study_duration_ms);
        assert_eq!(counts, actual.element_counts);
    }

    #[test]
    fn summarize_no_activity_today_returns_zero_duration() {
        // Arrange

        let daily_activity = vec![day("2026-09-26", 5_000)];

        // Act

        let actual = summarize(
            daily_activity,
            Vec::new(),
            "2026-09-27".parse().unwrap(),
            ElementCounts::default(),
        );

        // Assert

        assert_eq!(0, actual.today_study_duration_ms);
    }
}
