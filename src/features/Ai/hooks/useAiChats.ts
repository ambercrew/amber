import { useCallback, useRef, useState } from "react";
import {
	deleteAiChat,
	branchAiChat,
	getAllAiChatsSortedByDateDesc,
	getChatMessagesOrdered,
	renameAiChat,
} from "../../../api/aiIntegration/api/aiApi";
import MessageDto from "../../../api/aiIntegration/dto/messageDto";
import ChatResponseDto from "../../../api/aiIntegration/dto/chatResponseDto";
import useApi from "../../../hooks/useApi";

/**
 * Owns the chat list, the selected chat and its messages, plus the shared state every AI action
 * reports its errors through.
 */
export default function useAiChats() {
	const { callApi, isSendingRequest, errorMessage, clearErrorMessage } =
		useApi();

	const [chats, setChats] = useState<ChatResponseDto[]>([]);
	// Not persisted: every launch starts on a new chat.
	const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
	const [messages, setMessages] = useState<MessageDto[]>([]);

	// A `createdChat` event or a first upload can switch chats mid-request, so callbacks read the active
	// chat from this ref (shared with those hooks), not a stale `selectedChatId`.
	const activeChatIdRef = useRef<string | null>(selectedChatId);

	const refreshChats = useCallback(async () => {
		await callApi(async () => {
			setChats(await getAllAiChatsSortedByDateDesc());
		});
	}, [callApi]);

	const openChat = useCallback(
		async (chatId: string) => {
			await callApi(async () => {
				setSelectedChatId(chatId);
				activeChatIdRef.current = chatId;
				const msgs = await getChatMessagesOrdered(chatId);
				setMessages(msgs);
			});
		},
		[callApi, setSelectedChatId],
	);

	const startNewChat = useCallback(() => {
		setSelectedChatId(null);
		activeChatIdRef.current = null;
		setMessages([]);
	}, [setSelectedChatId]);

	const removeChat = useCallback(
		async (chatId: string) => {
			await callApi(async () => {
				await deleteAiChat(chatId);
				setChats(prev => prev.filter(c => c.id !== chatId));
				if (selectedChatId === chatId) startNewChat();
			});
		},
		[callApi, selectedChatId, startNewChat],
	);

	// Opens the branch, which now leads the chat list as its most recent chat.
	const branchChat = useCallback(
		async (chatId: string, messageId: string) => {
			await callApi(async () => {
				const branch = await branchAiChat(chatId, messageId);
				setChats(await getAllAiChatsSortedByDateDesc());
				setSelectedChatId(branch.id);
				activeChatIdRef.current = branch.id;
				setMessages(await getChatMessagesOrdered(branch.id));
			});
		},
		[callApi, setSelectedChatId],
	);

	const renameChat = useCallback(
		async (chatId: string, newTitle: string) => {
			await callApi(async () => {
				await renameAiChat(chatId, newTitle);
				setChats(prev =>
					prev.map(c =>
						c.id === chatId ? { ...c, title: newTitle } : c,
					),
				);
			});
		},
		[callApi],
	);

	return {
		chats,
		setChats,
		selectedChatId,
		setSelectedChatId,
		messages,
		setMessages,
		activeChatIdRef,
		callApi,
		isSendingRequest,
		errorMessage,
		clearErrorMessage,
		refreshChats,
		openChat,
		startNewChat,
		removeChat,
		renameChat,
		branchChat,
	};
}
