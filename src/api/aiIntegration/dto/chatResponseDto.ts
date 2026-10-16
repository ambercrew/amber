import ChatDto from "./chatDto";

export default interface ChatResponseDto extends ChatDto {
	lastActivityDate: string;
}

/** A chat just created has no messages, so its last activity is its creation. */
export function toChatResponseDto(chat: ChatDto): ChatResponseDto {
	return { ...chat, lastActivityDate: chat.createdDate };
}
