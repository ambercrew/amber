import { act, renderHook } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { Channel } from "@tauri-apps/api/core";
import useAiChats from "../../../../features/Ai/hooks/useAiChats";
import useAiStreaming from "../../../../features/Ai/hooks/useAiStreaming";
import { ElementId } from "../../../../types/elements/elementId";
import {
	getAllAiChatsSortedByDateDesc,
	getChatMessagesOrdered,
	stopAiGeneration,
	streamAiResponse,
} from "../../../../api/aiIntegration/api/aiApi";
import ChatDto from "../../../../api/aiIntegration/dto/chatDto";
import MessageDto from "../../../../api/aiIntegration/dto/messageDto";
import StreamLlmResponseEventDto from "../../../../api/aiIntegration/dto/streamLlmResponseEventDto";
import { setupStore } from "../../../../stores/store";

vi.mock(import("../../../../api/aiIntegration/api/aiApi"));

vi.mock("@tauri-apps/api/core", () => {
	class MockChannel {
		onmessage: unknown = null;
	}

	return { Channel: MockChannel };
});

const chat1: ChatDto = { id: "chat-1", title: "Chat 1", createdDate: "date" };
const chat2: ChatDto = { id: "chat-2", title: "Chat 2", createdDate: "date" };

const message1: MessageDto = {
	id: "message-1",
	createdDate: "date",
	chatId: "chat-1",
	content: { type: "human", value: "hi" },
	contextSnippets: [],
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() {}

function getCapturedChannel() {
	const calls = vi.mocked(streamAiResponse).mock.calls;
	return calls[calls.length - 1][0] as Channel<StreamLlmResponseEventDto>;
}

function makeStore(snippets: { id: string; text: string }[] = []) {
	return setupStore({ ai: { snippets } });
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
	return function Wrapper({ children }: PropsWithChildren) {
		return <Provider store={store}>{children}</Provider>;
	};
}

// `useAiStreaming` relies on state/setters owned by `useAiChats` (the same
// way `AiPanel` composes them), so tests exercise both together.
function useTestHarness() {
	const chats = useAiChats();
	const streaming = useAiStreaming({
		...chats,
		currentElementId: null,
		contextSnippets: [],
	});
	return { ...chats, ...streaming };
}

describe("useAiStreaming", () => {
	beforeEach(() => window.localStorage.clear());

	it("Should call stopAiGeneration when stopping generation", async () => {
		// Act

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			await result.current.stopGeneration();
		});

		// Assert

		expect(stopAiGeneration).toHaveBeenCalled();
	});

	it("Should set pending and streaming state synchronously when sending a prompt", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});

		// Act

		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});

		// Assert

		expect(result.current.pendingHumanText).toBe("hello");
		expect(result.current.streamingAssistantText).toBe("");
		expect(result.current.isStreaming).toBe(true);
		expect(streamAiResponse).toHaveBeenCalledWith(expect.anything(), {
			prompt: "hello",
			chatId: null,
			elementId: null,
			contextSnippets: [],
		});
	});

	it("Should forward the current element id when sending a prompt", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));
		const elementId: ElementId = {
			type: "learningAsset",
			id: "learningAsset-1",
		};

		const { result } = renderHook(
			() => {
				const chats = useAiChats();
				return {
					...chats,
					...useAiStreaming({
						...chats,
						currentElementId: elementId,
						contextSnippets: [],
					}),
				};
			},
			{ wrapper: makeWrapper(makeStore()) },
		);

		// Act

		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});

		// Assert

		expect(streamAiResponse).toHaveBeenCalledWith(expect.anything(), {
			prompt: "hello",
			chatId: null,
			elementId,
			contextSnippets: [],
		});
	});

	it("Should forward context snippets when sending a prompt", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));

		const { result } = renderHook(
			() => {
				const chats = useAiChats();
				return {
					...chats,
					...useAiStreaming({
						...chats,
						currentElementId: null,
						contextSnippets: [
							"Selected text one",
							"Selected text two",
						],
					}),
				};
			},
			{ wrapper: makeWrapper(makeStore()) },
		);

		// Act

		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});

		// Assert

		expect(streamAiResponse).toHaveBeenCalledWith(expect.anything(), {
			prompt: "hello",
			chatId: null,
			elementId: null,
			contextSnippets: ["Selected text one", "Selected text two"],
		});
	});

	it("Should clear ai context snippets once a prompt finishes without error", async () => {
		// Arrange

		let resolveStream: () => void = noop;
		vi.mocked(streamAiResponse).mockImplementation(
			() =>
				new Promise(resolve => {
					resolveStream = resolve;
				}),
		);
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([]);
		const store = makeStore([{ id: "snippet-1", text: "Selected text" }]);

		const { result } = renderHook(
			() => {
				const chats = useAiChats();
				return {
					...chats,
					...useAiStreaming({
						...chats,
						currentElementId: null,
						contextSnippets: ["Selected text"],
					}),
				};
			},
			{ wrapper: makeWrapper(store) },
		);

		let sendPromise!: Promise<void>;
		await act(async () => {
			sendPromise = result.current.sendPrompt("hello");
			await Promise.resolve();
		});

		// Act

		await act(async () => {
			resolveStream();
			await sendPromise;
		});

		// Assert

		expect(store.getState().ai.snippets).toEqual([]);
	});

	it("Should keep ai context snippets when a prompt errors", async () => {
		// Arrange

		let resolveStream: () => void = noop;
		vi.mocked(streamAiResponse).mockImplementation(
			() =>
				new Promise(resolve => {
					resolveStream = resolve;
				}),
		);
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([]);
		const snippet = { id: "snippet-1", text: "Selected text" };
		const store = makeStore([snippet]);

		const { result } = renderHook(
			() => {
				const chats = useAiChats();
				return {
					...chats,
					...useAiStreaming({
						...chats,
						currentElementId: null,
						contextSnippets: ["Selected text"],
					}),
				};
			},
			{ wrapper: makeWrapper(store) },
		);

		let sendPromise!: Promise<void>;
		await act(async () => {
			sendPromise = result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		const channel = getCapturedChannel();
		act(() => {
			channel.onmessage({ event: "error", data: "Something went wrong" });
		});

		// Act

		await act(async () => {
			resolveStream();
			await sendPromise;
		});

		// Assert

		expect(store.getState().ai.snippets).toEqual([snippet]);
	});

	it("Should append inProgress chunks to streamingAssistantText as they arrive", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		const channel = getCapturedChannel();
		act(() => {
			channel.onmessage({ event: "createdChat", data: chat1 });
		});

		// Act

		act(() => {
			channel.onmessage({
				event: "inProgress",
				data: { chatId: "chat-1", text: "Hi" },
			});
		});
		act(() => {
			channel.onmessage({
				event: "inProgress",
				data: { chatId: "chat-1", text: " there" },
			});
		});

		// Assert

		expect(result.current.streamingAssistantText).toBe("Hi there");
	});

	it("Should surface toolCall and toolResult events in streamingToolMessages as they arrive", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		const channel = getCapturedChannel();
		act(() => {
			channel.onmessage({ event: "createdChat", data: chat1 });
		});

		// Act

		act(() => {
			channel.onmessage({
				event: "toolCall",
				data: {
					chatId: "chat-1",
					toolCall: {
						id: "tc-1",
						name: "search_documents",
						arguments: { query: "test" },
					},
				},
			});
		});
		act(() => {
			channel.onmessage({
				event: "toolResult",
				data: {
					chatId: "chat-1",
					toolResult: { id: "tc-1", text: "Found nothing" },
				},
			});
		});

		// Assert

		expect(result.current.streamingToolMessages).toEqual([
			{
				id: "streaming-tool-call-tc-1",
				content: {
					type: "toolCall",
					value: {
						id: "tc-1",
						name: "search_documents",
						arguments: { query: "test" },
					},
				},
			},
			{
				id: "streaming-tool-result-tc-1",
				content: {
					type: "toolResult",
					value: { id: "tc-1", text: "Found nothing" },
				},
			},
		]);
	});

	it("Should hide pendingHumanText and streamingAssistantText when the user switches to a different chat", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([
			chat1,
			chat2,
		]);
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			await result.current.openChat("chat-1");
		});
		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		const channel = getCapturedChannel();
		act(() => {
			channel.onmessage({
				event: "inProgress",
				data: { chatId: "chat-1", text: "Hi" },
			});
		});

		// Act

		await act(async () => {
			await result.current.openChat("chat-2");
		});

		// Assert

		expect(result.current.pendingHumanText).toBeNull();
		expect(result.current.streamingAssistantText).toBeNull();
	});

	it("Should select the newly created chat and prepend it to the chat list on createdChat", async () => {
		// Arrange

		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([chat1]);
		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			await result.current.refreshChats();
		});
		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		const channel = getCapturedChannel();

		// Act

		act(() => {
			channel.onmessage({ event: "createdChat", data: chat2 });
		});

		// Assert

		expect(result.current.selectedChatId).toBe("chat-2");
		expect(result.current.chats).toEqual([chat2, chat1]);
	});

	it("Should set streamError when an error event is received", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		const channel = getCapturedChannel();

		// Act

		act(() => {
			channel.onmessage({
				event: "error",
				data: "Something went wrong",
			});
		});

		// Assert

		expect(result.current.streamError).toBe("Something went wrong");
	});

	it("Should clear streamError when starting a new prompt", async () => {
		// Arrange

		vi.mocked(streamAiResponse).mockImplementation(() => new Promise(noop));

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			void result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		let channel = getCapturedChannel();
		act(() => {
			channel.onmessage({ event: "error", data: "Boom" });
		});
		expect(result.current.streamError).toBe("Boom");

		// Act

		await act(async () => {
			void result.current.sendPrompt("hello again");
			await Promise.resolve();
		});
		channel = getCapturedChannel();

		// Assert

		expect(result.current.streamError).toBeNull();
	});

	it("Should reset streaming state and refresh messages and chats once the stream finishes", async () => {
		// Arrange

		let resolveStream: () => void = noop;
		vi.mocked(streamAiResponse).mockImplementation(
			() =>
				new Promise(resolve => {
					resolveStream = resolve;
				}),
		);
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([message1]);
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([chat1]);

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		let sendPromise!: Promise<void>;
		await act(async () => {
			sendPromise = result.current.sendPrompt("hello");
			await Promise.resolve();
		});
		const channel = getCapturedChannel();
		act(() => {
			channel.onmessage({ event: "createdChat", data: chat1 });
		});

		// Act

		await act(async () => {
			resolveStream();
			await sendPromise;
		});

		// Assert

		expect(result.current.isStreaming).toBe(false);
		expect(result.current.pendingHumanText).toBeNull();
		expect(result.current.streamingAssistantText).toBeNull();
		expect(getChatMessagesOrdered).toHaveBeenCalledWith("chat-1");
		expect(result.current.messages).toEqual([message1]);
		expect(getAllAiChatsSortedByDateDesc).toHaveBeenCalled();
	});

	it("Should not fetch messages when the stream finishes without an active chat id", async () => {
		// Arrange

		let resolveStream: () => void = noop;
		vi.mocked(streamAiResponse).mockImplementation(
			() =>
				new Promise(resolve => {
					resolveStream = resolve;
				}),
		);
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		let sendPromise!: Promise<void>;
		await act(async () => {
			sendPromise = result.current.sendPrompt("hello");
			await Promise.resolve();
		});

		// Act

		await act(async () => {
			resolveStream();
			await sendPromise;
		});

		// Assert

		expect(getChatMessagesOrdered).not.toHaveBeenCalled();
	});

	it("Should keep streaming the same chat's messages when continuing an existing chat", async () => {
		// Arrange

		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);
		let resolveStream: () => void = noop;
		vi.mocked(streamAiResponse).mockImplementation(
			() =>
				new Promise(resolve => {
					resolveStream = resolve;
				}),
		);
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([chat1]);

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		// Act

		let sendPromise!: Promise<void>;
		await act(async () => {
			sendPromise = result.current.sendPrompt("hello again");
			await Promise.resolve();
		});
		await act(async () => {
			resolveStream();
			await sendPromise;
		});

		// Assert

		expect(streamAiResponse).toHaveBeenCalledWith(expect.anything(), {
			prompt: "hello again",
			chatId: "chat-1",
			elementId: null,
			contextSnippets: [],
		});
		expect(getChatMessagesOrdered).toHaveBeenLastCalledWith("chat-1");
	});

	it("Should set errorMessage when streamAiResponse throws, while still resetting streaming state", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(streamAiResponse).mockRejectedValue(
			new Error("Network error"),
		);
		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([]);

		// Act

		const { result } = renderHook(() => useTestHarness(), {
			wrapper: makeWrapper(makeStore()),
		});
		await act(async () => {
			await result.current.sendPrompt("hello");
		});

		// Assert

		expect(result.current.errorMessage).toBe("Network error");
		expect(result.current.isStreaming).toBe(false);
		expect(result.current.pendingHumanText).toBeNull();
	});
});
