use crate::local_configurations::repositories::local_configuration_repository::LocalConfigurationRepository;

/// Configuration values shared by every device through cloud sync, with the same typed access
/// (`LocalConfigurationRepositoryExt`) as the per-machine ones.
pub trait SyncedConfigurationRepository: LocalConfigurationRepository {}
