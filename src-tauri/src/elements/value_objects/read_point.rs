use serde::{Deserialize, Serialize};

/// The point a reader last read up to within a learning asset. Device-independent.
///
/// For a `LearningAssetType::Pdf` asset, there are no splits/blocks to address, so
/// `split` is unused (always `0`) and `block` holds the 1-based page number instead.
/// `{0, 0}` still unambiguously means "no read point yet" either way, since page
/// numbers never start at 0.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadPoint {
    /// `seq` of the split the user last read up to. Unused for `Pdf` learning assets.
    pub split: u32,
    /// Top-level block index within `split` that the user last read up to, or the
    /// 1-based page number for a `Pdf` learning asset.
    pub block: u32,
}
