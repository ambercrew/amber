use super::traits::Element;
use crate::elements::value_objects::meta::Meta;

#[derive(Debug, Clone, PartialEq)]
pub struct Extract {
    pub meta: Meta,
    pub content: String,
    /// Multiplier applied on each revisit, seeded from the effective profile's `initial_interval_multiplier`
    /// at creation and fixed afterwards, whatever the profile later says.
    pub interval_multiplier: f32,
}

impl Element for Extract {
    fn meta(&self) -> &Meta {
        &self.meta
    }
}
