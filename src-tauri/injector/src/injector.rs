use std::{
    any::{Any, TypeId},
    collections::HashMap,
    pin::Pin,
    sync::Arc,
};

use crate::injector_scope::InjectorScope;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
pub type FactoryFunction = dyn Send
    + Sync
    + for<'a> Fn(&'a InjectorScope<'a>) -> BoxFuture<'a, Box<dyn Any + Send + Sync>>;

#[derive(Default)]
pub struct Injector {
    singleton_registry: HashMap<TypeId, Box<dyn Any + Send + Sync>>,
    scoped_factory_registry: HashMap<TypeId, Box<FactoryFunction>>,
}

#[macro_export]
macro_rules! register_scope {
    // With interface: cast to Arc<$interface>
    ($container:expr, $interface:ty, $implementation:ty) => {
        $container.register_scope_factory::<$interface>(|scope| {
            Box::pin(async move {
                use $crate::injector_scope::ScopeInjectable;
                let value = <$implementation>::from_injector_scope(scope).await;
                std::sync::Arc::new(value) as std::sync::Arc<$interface>
            })
        })
    };

    // Without interface: no casting, registers as Arc<$implementation>
    ($container:expr, $implementation:ty) => {
        $container.register_scope_factory::<$implementation>(|scope| {
            Box::pin(async move {
                use $crate::injector_scope::ScopeInjectable;
                let value = <$implementation>::from_injector_scope(scope).await;
                std::sync::Arc::new(value)
            })
        })
    };
}

impl Injector {
    pub fn singleton_registry(&self) -> &HashMap<TypeId, Box<dyn Any + Send + Sync>> {
        &self.singleton_registry
    }

    pub fn scoped_factory_registry(&self) -> &HashMap<TypeId, Box<FactoryFunction>> {
        &self.scoped_factory_registry
    }

    pub fn register_singleton<T: Any + Send + Sync + ?Sized>(&mut self, implementation: Arc<T>) {
        self.singleton_registry
            .insert(TypeId::of::<T>(), Box::new(implementation));
    }

    pub fn register_scope_factory<T: Any + Send + Sync + ?Sized + 'static>(
        &mut self,
        factory: impl for<'a> Fn(&'a InjectorScope) -> BoxFuture<'a, Arc<T>> + Send + Sync + 'static,
    ) {
        self.scoped_factory_registry.insert(
            TypeId::of::<T>(),
            Box::new(move |scope: &InjectorScope| {
                let fut = factory(scope);
                Box::pin(async move {
                    let result: Arc<T> = fut.await;
                    Box::new(result) as Box<dyn Any + Send + Sync>
                }) as BoxFuture<Box<dyn Any + Send + Sync>>
            }),
        );
    }

    /// The registered singleton of type `T`, if any, without starting a scope.
    pub fn singleton<T: Any + Send + Sync + ?Sized + 'static>(&self) -> Option<Arc<T>> {
        self.singleton_registry
            .get(&TypeId::of::<T>())
            .and_then(|boxed| boxed.downcast_ref::<Arc<T>>())
            .cloned()
    }

    pub fn start_scope(&self) -> InjectorScope<'_> {
        InjectorScope::new(self)
    }

    /// A method, useful for testing and for validating that all dependencies
    /// can be made. This work by creating a scope and creating an instance of
    /// all possible dependencies and checking that it is possible.
    pub async fn validate(&self) {
        let scope = self.start_scope();

        for factory in self.scoped_factory_registry.values() {
            factory(&scope).await;
        }
    }
}
