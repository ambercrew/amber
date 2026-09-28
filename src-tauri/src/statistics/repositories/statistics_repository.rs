use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};

use crate::common::repository_error::RepositoryError;
use crate::statistics::value_objects::daily_activity::DailyActivity;
use crate::statistics::value_objects::daily_forecast::DailyForecast;
use crate::statistics::value_objects::element_counts::ElementCounts;

#[async_trait]
pub trait StatisticsRepository: Send + Sync {
    /// Elements reviewed on the local calendar day `date`, counting the same reviews as the daily activity.
    async fn count_reviewed_elements(
        &self,
        date: NaiveDate,
    ) -> Result<ElementCounts, RepositoryError>;

    /// Card and learning asset reviews since `since`, per local calendar day, oldest first.
    /// Each review's time counts up to `max_review_duration_ms`; finishes made outside a
    /// study session are left out.
    async fn get_daily_activity_since(
        &self,
        since: DateTime<Utc>,
        max_review_duration_ms: u64,
    ) -> Result<Vec<DailyActivity>, RepositoryError>;

    /// Cards and unfinished learning assets due in `[from, until)`, per local calendar day.
    async fn get_daily_forecast(
        &self,
        from: DateTime<Utc>,
        until: DateTime<Utc>,
    ) -> Result<Vec<DailyForecast>, RepositoryError>;
}
