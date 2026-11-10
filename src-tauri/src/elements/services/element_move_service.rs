use async_trait::async_trait;

use crate::elements::dto::move_element_dto::{MoveElementRequestDto, MoveElementResponseDto};
use crate::elements::services::element_move_error::ElementMoveError;

#[async_trait]
pub trait ElementMoveService: Send + Sync {
    async fn move_element(
        &self,
        dto: MoveElementRequestDto,
    ) -> Result<MoveElementResponseDto, ElementMoveError>;
}
