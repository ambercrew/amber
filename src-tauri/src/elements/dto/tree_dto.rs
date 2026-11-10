use serde::Serialize;

use crate::elements::value_objects::element_id::ElementId;
use crate::elements::value_objects::meta::Meta;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaNodeDto {
    pub element_id: ElementId,
    pub name: String,
    pub position: String,
}

impl From<&Meta> for MetaNodeDto {
    fn from(meta: &Meta) -> Self {
        Self {
            element_id: meta.element_id,
            name: meta.name.clone(),
            position: meta.position.to_string(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeChildrenDto {
    pub folders: Vec<NodeDto>,
    pub learning_assets: Vec<NodeDto>,
    pub extracts: Vec<NodeDto>,
    pub cards: Vec<NodeDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeDto {
    pub meta: MetaNodeDto,
    pub children: NodeChildrenDto,
}
