use async_trait::async_trait;
use fsrs::{ComputeParametersInput, FSRSError, FSRSItem};
use thiserror::Error;
use uuid::Uuid;

use crate::common::repository_error::RepositoryError;
use crate::study::services::profile_resolution_service::ProfileResolutionError;

/// Reviews ready to train on, detached from the database.
#[derive(Debug, Clone, PartialEq)]
pub struct FsrsTrainingSet {
    pub items: Vec<FSRSItem>,
    pub num_relearning_steps: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FsrsOptimization {
    pub params: Vec<f32>,
    /// How many card reviews the weights were trained on.
    pub review_count: usize,
}

#[async_trait]
pub trait FsrsOptimizationService: Send + Sync {
    /// Builds a training set from the review history of every card using `profile_id`.
    async fn prepare_training_set(
        &self,
        profile_id: Uuid,
        num_relearning_steps: usize,
    ) -> Result<FsrsTrainingSet, FsrsOptimizationError>;
}

/// Trains FSRS weights without saving them. CPU-bound and slow on large collections, so call it
/// after the scope that prepared `training_set` is dropped, to hold no database connection.
pub async fn train_fsrs_params(
    training_set: FsrsTrainingSet,
) -> Result<FsrsOptimization, FsrsOptimizationError> {
    let review_count = training_set.items.len();
    let input = ComputeParametersInput {
        train_set: training_set.items,
        num_relearning_steps: Some(training_set.num_relearning_steps),
        ..ComputeParametersInput::default()
    };
    let params = tokio::task::spawn_blocking(move || fsrs::compute_parameters(input)).await??;

    // Under 64 usable items only the first 4 weights train; defaults mean none could.
    if params == fsrs::DEFAULT_PARAMETERS {
        return Err(FsrsOptimizationError::NotEnoughReviews);
    }
    Ok(FsrsOptimization {
        params,
        review_count,
    })
}

#[derive(Debug, Error)]
pub enum FsrsOptimizationError {
    #[error(transparent)]
    Repository(#[from] RepositoryError),

    #[error(transparent)]
    ProfileResolution(#[from] ProfileResolutionError),

    #[error("Not enough review history to optimize yet. Keep reviewing cards and try again later.")]
    NotEnoughReviews,

    #[error("FSRS optimization failed: {0}")]
    Fsrs(FSRSError),

    #[error("FSRS optimization was interrupted")]
    Interrupted(#[from] tokio::task::JoinError),
}

impl From<FSRSError> for FsrsOptimizationError {
    fn from(error: FSRSError) -> Self {
        match error {
            FSRSError::NotEnoughData => FsrsOptimizationError::NotEnoughReviews,
            other => FsrsOptimizationError::Fsrs(other),
        }
    }
}

#[cfg(test)]
mod tests {
    use fsrs::FSRSReview;

    use super::*;

    fn item(first_rating: u32, second_rating: u32) -> FSRSItem {
        FSRSItem {
            reviews: vec![
                FSRSReview {
                    rating: first_rating,
                    delta_t: 0,
                },
                FSRSReview {
                    rating: second_rating,
                    delta_t: 1,
                },
            ],
        }
    }

    #[tokio::test]
    async fn train_fsrs_params_under_64_items_returns_trained_initial_stability() {
        // Arrange

        let items = (0..30)
            .map(|i| item(3, if i % 5 == 0 { 1 } else { 3 }))
            .collect();
        let training_set = FsrsTrainingSet {
            items,
            num_relearning_steps: 1,
        };

        // Act

        let actual = train_fsrs_params(training_set).await.unwrap();

        // Assert

        assert_ne!(fsrs::DEFAULT_PARAMETERS[..4], actual.params[..4]);
        assert_eq!(fsrs::DEFAULT_PARAMETERS[4..], actual.params[4..]);
        assert_eq!(30, actual.review_count);
    }
}
