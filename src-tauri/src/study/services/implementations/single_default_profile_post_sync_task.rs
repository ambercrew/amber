use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::study::entities::study_profile::StudyProfile;
use crate::study::services::study_profile_service::StudyProfileService;
use crate::sync::post_sync_task::{PostSyncTask, PostSyncTaskError};

/// Restores the "exactly one default study profile" invariant after a sync.
///
/// `study_profiles` syncs at row granularity, so last-writer-wins resolves each
/// row on its own and knows nothing about a flag meant to be unique across rows:
/// two devices can each end up with their own default, and deleting the only
/// default leaves none.
///
/// The winner is picked from `created_at` and `id` alone — both immutable and
/// synced, so every device lands on the same profile. `modified_at` is unusable
/// here: a local trigger rewrites it whenever a row is written, applying a
/// remote row included.
#[derive(ScopeInjectable)]
pub struct SingleDefaultProfilePostSyncTask {
    study_profile_service: Arc<dyn StudyProfileService>,
}

#[async_trait]
impl PostSyncTask for SingleDefaultProfilePostSyncTask {
    fn name(&self) -> &'static str {
        "single default study profile"
    }

    async fn run(&self) -> Result<(), PostSyncTaskError> {
        let profiles = self.study_profile_service.list_profiles().await?;
        let defaults: Vec<&StudyProfile> = profiles
            .iter()
            .filter(|profile| profile.is_default)
            .collect();

        // Nothing to repair, and nothing to promote when there is no profile at
        // all — the seeded profile arrives with the rest of the pull.
        if defaults.len() == 1 || profiles.is_empty() {
            return Ok(());
        }

        let winner = if defaults.is_empty() {
            // Same fallback `get_default_or_oldest` already applies when no
            // profile is flagged, made explicit so every device agrees.
            oldest(profiles.iter())
        } else {
            // Of several claimants, the most recently created one is kept: it is
            // the profile a user most plausibly created and made default last.
            newest(defaults.into_iter())
        };

        let Some(winner) = winner else {
            return Ok(());
        };

        log::info!(
            "Post-sync repair: making study profile {} the single default",
            winner.id
        );
        self.study_profile_service
            .set_default_profile(winner.id)
            .await?;

        Ok(())
    }
}

fn oldest<'a>(profiles: impl Iterator<Item = &'a StudyProfile>) -> Option<&'a StudyProfile> {
    profiles.min_by_key(|profile| (profile.created_at, profile.id))
}

fn newest<'a>(profiles: impl Iterator<Item = &'a StudyProfile>) -> Option<&'a StudyProfile> {
    profiles.max_by_key(|profile| (profile.created_at, profile.id))
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, TimeZone, Utc};
    use injector::{injector::Injector, register_scope};
    use uuid::Uuid;

    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_study_profile_repository::SqliteStudyProfileRepository;
    use crate::study::repositories::study_profile_repository::StudyProfileRepository;
    use crate::study::services::implementations::default_study_profile_service::DefaultStudyProfileService;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(
            injector,
            dyn StudyProfileRepository,
            SqliteStudyProfileRepository
        );
        register_scope!(
            injector,
            dyn StudyProfileService,
            DefaultStudyProfileService
        );
        register_scope!(injector, SingleDefaultProfilePostSyncTask);
        injector
    }

    fn created_at(day: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, day, 12, 0, 0).unwrap()
    }

    fn make_profile(id: Uuid, created_at: DateTime<Utc>, is_default: bool) -> StudyProfile {
        StudyProfile {
            id,
            created_at,
            modified_at: created_at,
            name: format!("Profile {id}"),
            is_default,
            desired_retention: 0.9,
            fsrs_params: None,
            learning_steps: None,
            relearning_steps: None,
            initial_interval_multiplier: 1.5,
            initial_interval_days: 1.0,
            min_interval_days: 1.0,
        }
    }

    async fn default_profile_ids(repository: &dyn StudyProfileRepository) -> Vec<Uuid> {
        repository
            .get_all()
            .await
            .unwrap()
            .into_iter()
            .filter(|profile| profile.is_default)
            .map(|profile| profile.id)
            .collect()
    }

    #[tokio::test]
    async fn run_several_default_profiles_keeps_only_the_most_recently_created_one() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn StudyProfileRepository>().await;
        let older = make_profile(Uuid::new_v4(), created_at(1), true);
        let newer = make_profile(Uuid::new_v4(), created_at(2), true);
        repository.create(&older).await.unwrap();
        repository.create(&newer).await.unwrap();
        let subject = scope.resolve::<SingleDefaultProfilePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        assert_eq!(vec![newer.id], default_profile_ids(&*repository).await);
    }

    #[tokio::test]
    async fn run_default_profiles_created_at_the_same_time_keeps_the_highest_id() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn StudyProfileRepository>().await;
        let lower_id = make_profile(Uuid::from_u128(1), created_at(1), true);
        let higher_id = make_profile(Uuid::from_u128(2), created_at(1), true);
        repository.create(&lower_id).await.unwrap();
        repository.create(&higher_id).await.unwrap();
        let subject = scope.resolve::<SingleDefaultProfilePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        assert_eq!(vec![higher_id.id], default_profile_ids(&*repository).await);
    }

    #[tokio::test]
    async fn run_no_default_profile_promotes_the_oldest_profile() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn StudyProfileRepository>().await;
        let oldest = make_profile(Uuid::new_v4(), created_at(1), false);
        let newer = make_profile(Uuid::new_v4(), created_at(2), false);
        repository.create(&oldest).await.unwrap();
        repository.create(&newer).await.unwrap();
        let subject = scope.resolve::<SingleDefaultProfilePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        assert_eq!(vec![oldest.id], default_profile_ids(&*repository).await);
    }

    #[tokio::test]
    async fn run_exactly_one_default_profile_leaves_the_default_untouched() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn StudyProfileRepository>().await;
        let default = make_profile(Uuid::new_v4(), created_at(2), true);
        let other = make_profile(Uuid::new_v4(), created_at(1), false);
        repository.create(&default).await.unwrap();
        repository.create(&other).await.unwrap();
        let subject = scope.resolve::<SingleDefaultProfilePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        assert_eq!(vec![default.id], default_profile_ids(&*repository).await);
    }

    #[tokio::test]
    async fn run_no_profiles_at_all_does_nothing() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let repository = scope.resolve::<dyn StudyProfileRepository>().await;
        let subject = scope.resolve::<SingleDefaultProfilePostSyncTask>().await;

        // Act

        subject.run().await.unwrap();

        // Assert

        assert!(repository.get_all().await.unwrap().is_empty());
    }
}
