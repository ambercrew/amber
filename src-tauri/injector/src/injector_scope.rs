use std::{
    any::{Any, TypeId, type_name},
    collections::HashMap,
    sync::Arc,
};

use async_trait::async_trait;
use tokio::sync::Mutex;

use crate::injector::Injector;

#[async_trait]
pub trait ScopeInjectable {
    async fn from_injector_scope(scope: &InjectorScope<'_>) -> Self;
}

pub struct InjectorScope<'a> {
    injector: &'a Injector,
    resolved_scopes: Mutex<HashMap<TypeId, Box<dyn Any + Send + Sync>>>,
}

impl<'a> InjectorScope<'a> {
    pub fn new(injector: &'a Injector) -> Self {
        Self {
            injector,
            resolved_scopes: Mutex::new(HashMap::new()),
        }
    }

    pub async fn resolve<T: Any + Send + Sync + ?Sized + 'static>(&'a self) -> Arc<T> {
        if let Some(singleton) = find_by_type::<T>(self.injector.singleton_registry()) {
            return singleton;
        }

        if let Some(scoped) = find_by_type::<T>(&*self.resolved_scopes.lock().await) {
            return scoped;
        }

        if let Some(factory) = self
            .injector
            .scoped_factory_registry()
            .get(&TypeId::of::<T>())
        {
            let boxed = factory(self).await;
            if let Some(scoped) = boxed.downcast_ref::<Arc<T>>().cloned() {
                self.resolved_scopes
                    .lock()
                    .await
                    .insert(TypeId::of::<T>(), Box::new(scoped.clone()));
                return scoped;
            }
        }

        panic!("Could not resolve {}", type_name::<T>())
    }

    /// Seeds the scope with `value`, which resolving `T` then returns instead of running `T`'s factory.
    pub async fn provide<T: Any + Send + Sync + ?Sized + 'static>(&self, value: Arc<T>) {
        self.resolved_scopes
            .lock()
            .await
            .insert(TypeId::of::<T>(), Box::new(value));
    }
}

fn find_by_type<T: Any + Send + Sync + ?Sized + 'static>(
    hash_map: &HashMap<TypeId, Box<dyn Any + Send + Sync>>,
) -> Option<Arc<T>> {
    hash_map
        .get(&TypeId::of::<T>())
        .and_then(|boxed| boxed.downcast_ref::<Arc<T>>())
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI32, Ordering};

    use crate::injector::Injector;

    #[tokio::test]
    pub async fn resolve_scoped_factory_returned_same_value() {
        // Arrange

        let mut injector = Injector::default();
        let called_times = Arc::new(AtomicI32::new(0));
        let called_times_clone = called_times.clone();

        injector.register_scope_factory::<i32>(move |_| {
            let called_times_clone = called_times_clone.clone();

            Box::pin(async move {
                called_times_clone.store(
                    called_times_clone.load(Ordering::Relaxed) + 1,
                    Ordering::Relaxed,
                );
                Arc::new(called_times_clone.load(Ordering::Relaxed))
            })
        });

        let scope = injector.start_scope();

        // Act

        scope.resolve::<i32>().await;
        scope.resolve::<i32>().await;
        scope.resolve::<i32>().await;
        let last = scope.resolve::<i32>().await;

        // Act

        assert_eq!(1, *last);
        assert_eq!(1, called_times.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn resolve_provided_value_returned_without_calling_factory() {
        // Arrange

        let mut injector = Injector::default();
        let called = Arc::new(AtomicI32::new(0));
        let called_clone = called.clone();
        injector.register_scope_factory::<i32>(move |_| {
            called_clone.fetch_add(1, Ordering::Relaxed);
            Box::pin(async { Arc::new(1) })
        });
        let scope = injector.start_scope();
        scope.provide(Arc::new(42)).await;

        // Act

        let actual = scope.resolve::<i32>().await;

        // Assert

        assert_eq!(42, *actual);
        assert_eq!(0, called.load(Ordering::Relaxed));
    }

    #[tokio::test]
    pub async fn singleton_registered_returns_it_and_unregistered_returns_none() {
        // Arrange

        let mut injector = Injector::default();
        injector.register_singleton(Arc::new(7_u8));

        // Act

        let registered = injector.singleton::<u8>();
        let unregistered = injector.singleton::<u16>();

        // Assert

        assert_eq!(Some(7), registered.map(|value| *value));
        assert!(unregistered.is_none());
    }
}
