import { Channel, invoke } from "@tauri-apps/api/core";
import ChatDto from "../dto/chatDto";
import ChatResponseDto from "../dto/chatResponseDto";
import MessageDto from "../dto/messageDto";
import StreamAiRequestDto from "../dto/streamAiRequestDto";
import StreamLlmResponseEventDto from "../dto/streamLlmResponseEventDto";
import UploadOutcomeDto from "../dto/uploadOutcomeDto";

export function streamAiResponse(
	onEvent: Channel<StreamLlmResponseEventDto>,
	request: StreamAiRequestDto,
): Promise<void> {
	return invoke("stream_ai_response", { onEvent, request });
}

export function createAiChat(title: string): Promise<ChatDto> {
	return invoke("create_ai_chat", { title });
}

export function stopAiGeneration(): Promise<void> {
	return invoke("stop_ai_generation");
}

export function resolveToolApproval(
	messageId: string,
	approved: boolean,
): Promise<MessageDto> {
	return invoke("resolve_tool_approval", { messageId, approved });
}

export function getAllAiChatsSortedByDateDesc(): Promise<ChatResponseDto[]> {
	return invoke("get_all_ai_chats_sorted_by_date_desc");
}

export function deleteAiChat(id: string): Promise<void> {
	return invoke("delete_ai_chat", { id });
}

export function getChatMessagesOrdered(id: string): Promise<MessageDto[]> {
	return invoke("get_chat_messages_ordered", { id });
}

export function renameAiChat(id: string, newTitle: string): Promise<void> {
	return invoke("rename_ai_chat", { id, newTitle });
}

export function uploadDocument(
	path: string,
	chatId: string,
): Promise<UploadOutcomeDto> {
	return invoke("upload_document", { path, chatId });
}
