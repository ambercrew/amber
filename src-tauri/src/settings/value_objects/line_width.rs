use serde::{Deserialize, Serialize};

/// How much of the available width the element editors take up.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LineWidth {
    #[default]
    Narrow,
    Medium,
    Wide,
}
