use std::path::PathBuf;
use std::sync::Arc;

use crate::{
    ai_integration::{
        ai_state::AiState,
        dto::{
            chat_response_dto::ChatResponseDto, message_response_dto::MessageResponseDto,
            stream_ai_request_dto::StreamAiRequestDto,
        },
        entities::{chat::Chat, context_snippet::group_snippets_by_message},
        repositories::ai_repository::AiRepository,
        services::{
            ai_streamer::{AiStreamer, StreamLlmResponseEvent},
            document_uploader::{DocumentUploader, UploadOutcome},
        },
    },
    common::api_error::ApiError,
    infrastructure::extensions::unit_of_work::UnitOfWorkExt,
};
use injector::injector::Injector;
use tauri::{State, ipc::Channel};
use uuid::Uuid;

#[tauri::command]
pub async fn stream_ai_response(
    injector: State<'_, Arc<Injector>>,
    on_event: Channel<StreamLlmResponseEvent>,
    request: StreamAiRequestDto,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();

    let result = scope
        .resolve::<dyn AiStreamer>()
        .await
        .stream(
            request,
            Arc::new(move |event| {
                on_event.send(event)?;
                Ok(())
            }),
        )
        .await;

    scope.save_changes().await?;

    result.map_err(ApiError::from)
}

#[tauri::command]
pub async fn create_ai_chat(
    injector: State<'_, Arc<Injector>>,
    title: String,
) -> Result<Chat, ApiError> {
    let scope = injector.start_scope();
    let chat = Chat::new(None, title);
    scope
        .resolve::<dyn AiRepository>()
        .await
        .upsert_chat(&chat)
        .await?;
    scope.save_changes().await?;
    Ok(chat)
}

#[tauri::command]
pub async fn stop_ai_generation(injector: State<'_, Arc<Injector>>) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let state = scope.resolve::<AiState>().await;
    state.cancel_generation();
    Ok(())
}

#[tauri::command]
pub async fn get_all_ai_chats_sorted_by_date_desc(
    injector: State<'_, Arc<Injector>>,
) -> Result<Vec<ChatResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let chats = scope
        .resolve::<dyn AiRepository>()
        .await
        .get_all_chats_sorted_by_last_activity_desc()
        .await?;
    Ok(chats
        .into_iter()
        .map(|(chat, last_activity_date)| ChatResponseDto::new(chat, last_activity_date))
        .collect())
}

#[tauri::command]
pub async fn delete_ai_chat(injector: State<'_, Arc<Injector>>, id: Uuid) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    scope
        .resolve::<dyn AiRepository>()
        .await
        .delete_chat(id)
        .await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_chat_messages_ordered(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
) -> Result<Vec<MessageResponseDto>, ApiError> {
    let scope = injector.start_scope();
    let ai_repository = scope.resolve::<dyn AiRepository>().await;
    let messages = ai_repository.get_chat_messages_ordered(id).await?;
    let mut context_snippets_by_message =
        group_snippets_by_message(ai_repository.get_context_snippets_for_chat(id).await?);

    Ok(messages
        .into_iter()
        .map(|message| {
            let context_snippets = context_snippets_by_message
                .remove(&message.id())
                .unwrap_or_default();
            MessageResponseDto::new(message, context_snippets)
        })
        .collect())
}

#[tauri::command]
pub async fn rename_ai_chat(
    injector: State<'_, Arc<Injector>>,
    id: Uuid,
    new_title: String,
) -> Result<(), ApiError> {
    let scope = injector.start_scope();
    let ai_repository = scope.resolve::<dyn AiRepository>().await;
    let mut chat = ai_repository.get_chat_by_id(id).await?;
    chat.set_title(new_title);
    ai_repository.upsert_chat(&chat).await?;
    scope.save_changes().await?;
    Ok(())
}

#[tauri::command]
pub async fn upload_document(
    injector: State<'_, Arc<Injector>>,
    path: String,
    chat_id: Uuid,
) -> Result<UploadOutcome, ApiError> {
    let scope = injector.start_scope();
    let outcome = scope
        .resolve::<dyn DocumentUploader>()
        .await
        .upload_document(PathBuf::from(path), chat_id)
        .await?;
    scope.save_changes().await?;
    Ok(outcome)
}
