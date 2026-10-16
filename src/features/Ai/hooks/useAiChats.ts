import { useLocalStorage } from "@mantine/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	deleteAiChat,
	getAllAiChatsSortedByDateDesc,
	getChatMessagesOrdered,
	renameAiChat,
} from "../../../api/aiIntegration/api/aiApi";
import MessageDto from "../../../api/aiIntegration/dto/messageDto";
import ChatResponseDto from "../../../api/aiIntegration/dto/chatResponseDto";
import useApi from "../../../hooks/useApi";

/**
 * Owns the chat list, the selected chat, and its messages, plus the shared
 * state that are handed so every AI action surfaces through the
 * same error state.
 */
export default function useAiChats() {
	const { callApi, isSendingRequest, errorMessage, clearErrorMessage } =
		useApi();

	const [chats, setChats] = useState<ChatResponseDto[]>([]);
	const [selectedChatId, setSelectedChatId] = useLocalStorage<string | null>({
		key: "ai-selected-chat-id",
		defaultValue: null,
		getInitialValueInEffect: false,
	});
	const [messages, setMessages] = useState<MessageDto[]>([]);

	// The streaming/upload callbacks close over the chat id at the time the
	// request was sent; a `createdChat` event or a first upload can change
	// the active chat mid-request, so it's kept in a ref (shared with those
	// hooks) rather than relying on the possibly-stale selectedChatId.
	const activeChatIdRef = useRef<string | null>(selectedChatId);

	// Restore the previously open chat's messages on mount, since the
	// selected id is persisted but its messages are not.
	useEffect(() => {
		if (!selectedChatId) return;
		void callApi(async () => {
			setMessages(await getChatMessagesOrdered(selectedChatId));
		});
		// Only run once on mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
	};
}
