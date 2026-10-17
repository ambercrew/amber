import {
	Dispatch,
	RefObject,
	SetStateAction,
	useCallback,
	useState,
} from "react";
import { Channel } from "@tauri-apps/api/core";
import {
	getChatMessagesOrdered,
	stopAiGeneration,
	streamAiResponse,
} from "../../../api/aiIntegration/api/aiApi";
import StreamLlmResponseEventDto from "../../../api/aiIntegration/dto/streamLlmResponseEventDto";
import MessageDto from "../../../api/aiIntegration/dto/messageDto";
import ChatResponseDto, {
	toChatResponseDto,
} from "../../../api/aiIntegration/dto/chatResponseDto";
import { CallApiFn } from "../../../hooks/useApi";
import { ElementId } from "../../../types/elements/elementId";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	clearAiContextSnippets,
	restoreAiContextSnippets,
} from "../../../stores/aiContext/aiReducer";
import { selectAiContextSnippets } from "../../../stores/aiContext/aiSelectors";
import { StreamingToolMessage } from "../utils/buildDisplayMessages";

interface UseAiStreamingParams {
	selectedChatId: string | null;
	setSelectedChatId: Dispatch<SetStateAction<string | null>>;
	setChats: Dispatch<SetStateAction<ChatResponseDto[]>>;
	setMessages: Dispatch<SetStateAction<MessageDto[]>>;
	activeChatIdRef: RefObject<string | null>;
	refreshChats: () => Promise<void>;
	callApi: CallApiFn;
	currentElementId: ElementId | null;
	contextSnippets: string[];
}

/** Sends prompts and streams the assistant's response for the chat managed by `useAiChats`. */
export default function useAiStreaming({
	selectedChatId,
	setSelectedChatId,
	setChats,
	setMessages,
	activeChatIdRef,
	refreshChats,
	callApi,
	currentElementId,
	contextSnippets,
}: UseAiStreamingParams) {
	const dispatch = useAppDispatch();
	const aiContextSnippets = useAppSelector(selectAiContextSnippets);
	const [pendingHumanText, setPendingHumanText] = useState<string | null>(
		null,
	);
	const [pendingContextSnippets, setPendingContextSnippets] = useState<
		string[] | null
	>(null);
	const [streamingAssistantText, setStreamingAssistantText] = useState<
		string | null
	>(null);
	const [streamingToolMessages, setStreamingToolMessages] = useState<
		StreamingToolMessage[]
	>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamError, setStreamError] = useState<string | null>(null);
	const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
	const [restoreKey, setRestoreKey] = useState(0);
	// Which chat the in-flight generation belongs to, so its pending human
	// prompt / streaming text is only shown while that chat is the one open.
	const [streamChatId, setStreamChatId] = useState<string | null>(null);

	const sendPrompt = useCallback(
		async (prompt: string) => {
			setStreamError(null);
			setPendingHumanText(prompt);
			setPendingContextSnippets(contextSnippets);
			setStreamingAssistantText("");
			setStreamingToolMessages([]);
			setIsStreaming(true);
			activeChatIdRef.current = selectedChatId;
			setStreamChatId(selectedChatId);

			const snippetsToRestore = aiContextSnippets;
			dispatch(clearAiContextSnippets());

			// Read synchronously in `onFinally` below, since state set from
			// the channel handler or the catch block hasn't re-rendered yet
			// by the time `onFinally` runs.
			let failed = false;

			const channel = new Channel<StreamLlmResponseEventDto>();
			channel.onmessage = event => {
				if (event.event === "createdChat") {
					activeChatIdRef.current = event.data.id;
					setSelectedChatId(event.data.id);
					setStreamChatId(event.data.id);
					setChats(prev => [toChatResponseDto(event.data), ...prev]);
				} else if (event.event === "inProgress") {
					setStreamChatId(event.data.chatId);
					setStreamingAssistantText(
						prev => (prev ?? "") + event.data.text,
					);
				} else if (event.event === "toolCall") {
					setStreamChatId(event.data.chatId);
					setStreamingToolMessages(prev => [
						...prev,
						{
							id: `streaming-tool-call-${event.data.toolCall.id}`,
							messageId: event.data.messageId,
							approvalMarkdown: event.data.approvalMarkdown,
							content: {
								type: "toolCall",
								value: event.data.toolCall,
							},
						},
					]);
				} else if (event.event === "toolResult") {
					setStreamChatId(event.data.chatId);
					setStreamingToolMessages(prev => [
						...prev,
						{
							id: `streaming-tool-result-${event.data.toolResult.id}`,
							content: {
								type: "toolResult",
								value: event.data.toolResult,
							},
						},
					]);
				} else if (event.event === "error") {
					failed = true;
					setStreamError(event.data);
				}
			};

			await callApi(
				async () => {
					try {
						await streamAiResponse(channel, {
							prompt,
							chatId: selectedChatId,
							elementId: currentElementId,
							contextSnippets,
						});
					} catch (e) {
						failed = true;
						throw e;
					}
				},
				async () => {
					setIsStreaming(false);
					setPendingHumanText(null);
					setPendingContextSnippets(null);
					setStreamingAssistantText(null);
					setStreamingToolMessages([]);
					setStreamChatId(null);
					if (failed) {
						setFailedPrompt(prompt);
						setRestoreKey(k => k + 1);
						if (snippetsToRestore.length > 0) {
							dispatch(
								restoreAiContextSnippets(snippetsToRestore),
							);
						}
					}

					const chatId = activeChatIdRef.current;
					if (chatId) {
						const msgs = await getChatMessagesOrdered(chatId);
						setMessages(msgs);
					}
					await refreshChats();
				},
			);
		},
		[
			activeChatIdRef,
			aiContextSnippets,
			callApi,
			contextSnippets,
			currentElementId,
			dispatch,
			refreshChats,
			selectedChatId,
			setChats,
			setMessages,
			setSelectedChatId,
		],
	);

	const clearStreamError = useCallback(() => setStreamError(null), []);

	const stopGeneration = useCallback(async () => {
		await stopAiGeneration();
	}, []);

	// The in-flight generation's pending prompt/streaming text belongs to
	// whichever chat it was sent to; only surface it while that chat is open.
	const isViewingStreamChat = streamChatId === selectedChatId;

	return {
		pendingHumanText: isViewingStreamChat ? pendingHumanText : null,
		pendingContextSnippets: isViewingStreamChat
			? pendingContextSnippets
			: null,
		streamingAssistantText: isViewingStreamChat
			? streamingAssistantText
			: null,
		streamingToolMessages: isViewingStreamChat ? streamingToolMessages : [],
		isStreaming,
		streamError,
		clearStreamError,
		failedPrompt,
		restoreKey,
		sendPrompt,
		stopGeneration,
	};
}
