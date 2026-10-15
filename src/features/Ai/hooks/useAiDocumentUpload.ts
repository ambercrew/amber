import {
	Dispatch,
	RefObject,
	SetStateAction,
	useCallback,
	useState,
} from "react";
import {
	createAiChat,
	deleteAiChat,
	getChatMessagesOrdered,
	uploadDocument,
} from "../../../api/aiIntegration/api/aiApi";
import MessageDto from "../../../api/aiIntegration/dto/messageDto";
import ChatDto from "../../../api/aiIntegration/dto/chatDto";
import UploadOutcomeDto from "../../../api/aiIntegration/dto/uploadOutcomeDto";
import { CallApiFn } from "../../../hooks/useApi";

interface UseAiDocumentUploadParams {
	selectedChatId: string | null;
	setSelectedChatId: Dispatch<SetStateAction<string | null>>;
	setChats: Dispatch<SetStateAction<ChatDto[]>>;
	setMessages: Dispatch<SetStateAction<MessageDto[]>>;
	activeChatIdRef: RefObject<string | null>;
	callApi: CallApiFn;
}

/** Uploads a document to the chat managed by `useAiChats`, creating one first if none is selected. */
export default function useAiDocumentUpload({
	selectedChatId,
	setSelectedChatId,
	setChats,
	setMessages,
	activeChatIdRef,
	callApi,
}: UseAiDocumentUploadParams) {
	const [isUploading, setIsUploading] = useState(false);
	const [pendingDocumentFileName, setPendingDocumentFileName] = useState<
		string | null
	>(null);
	// Which chat the in-flight upload belongs to, so its pending message is
	// only shown while that chat is the one open.
	const [uploadChatId, setUploadChatId] = useState<string | null>(null);

	const uploadDocumentToChat = useCallback(
		async (path: string) => {
			const fileName = path.split(/[/\\]/).pop() ?? path;
			setIsUploading(true);
			setPendingDocumentFileName(fileName);
			setUploadChatId(selectedChatId);

			await callApi(
				async () => {
					let chatId = selectedChatId;
					const createdChat = !chatId;
					if (!chatId) {
						const chat = await createAiChat(fileName);
						chatId = chat.id;
						activeChatIdRef.current = chat.id;
						setSelectedChatId(chat.id);
						setUploadChatId(chat.id);
						setChats(prev => [chat, ...prev]);
					}

					// A chat made just for this file is dropped rather than left empty.
					const discardCreatedChat = async (id: string) => {
						if (!createdChat) return;
						await deleteAiChat(id);
						setChats(prev => prev.filter(c => c.id !== id));
						if (id === activeChatIdRef.current) {
							activeChatIdRef.current = null;
							setSelectedChatId(null);
						}
					};

					let outcome: UploadOutcomeDto;
					try {
						outcome = await uploadDocument(path, chatId);
					} catch (error) {
						// Surface the upload's error, not a failed cleanup's.
						await discardCreatedChat(chatId).catch(() => undefined);
						throw error;
					}
					if (outcome === "stopped") {
						await discardCreatedChat(chatId);
						return;
					}
					const msgs = await getChatMessagesOrdered(chatId);
					// Only apply the refreshed messages if the user hasn't
					// since switched to a different chat, otherwise this
					// would overwrite whatever chat is now being viewed.
					if (chatId === activeChatIdRef.current) {
						setMessages(msgs);
					}
				},
				() => {
					setIsUploading(false);
					setPendingDocumentFileName(null);
					setUploadChatId(null);
					return Promise.resolve();
				},
			);
		},
		[
			activeChatIdRef,
			callApi,
			selectedChatId,
			setChats,
			setMessages,
			setSelectedChatId,
		],
	);

	// Same idea as streaming's pending text: only surface it while the chat
	// it belongs to is the one open.
	const isViewingUploadChat = uploadChatId === selectedChatId;

	return {
		isUploading,
		pendingDocumentFileName: isViewingUploadChat
			? pendingDocumentFileName
			: null,
		uploadDocumentToChat,
	};
}
