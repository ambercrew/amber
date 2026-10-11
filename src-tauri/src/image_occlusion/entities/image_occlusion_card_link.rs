use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageOcclusionCardLink {
    pub card_id: Uuid,
    pub occlusion_id: Uuid,
    pub target_key: String,
}
