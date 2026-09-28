use async_trait::async_trait;

use crate::common::repository_error::RepositoryError;
use crate::statistics::value_objects::home_statistics::HomeStatistics;

#[async_trait]
pub trait StatisticsService: Send + Sync {
    /// Elements reviewed today, today's study time, this year's daily activity and its remaining due reviews.
    async fn get_home_statistics(&self) -> Result<HomeStatistics, RepositoryError>;
}
