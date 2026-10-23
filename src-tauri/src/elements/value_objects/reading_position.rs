use serde::{Deserialize, Serialize};

/// A device-independent position in a learning asset's content, such as its read point or a mark.
/// For a PDF, `split` is the 1-based page and `block` is unused; `{0, 0}` means "no position" either way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPosition {
    /// `seq` of the split the position is in, or the 1-based page number for a `Pdf` learning asset.
    pub split: u32,
    /// Top-level block index within `split`. Unused for `Pdf` learning assets.
    pub block: u32,
}
