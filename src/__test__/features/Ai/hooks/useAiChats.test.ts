import { act, renderHook } from "@testing-library/react";
import useAiChats from "../../../../features/Ai/hooks/useAiChats";
import {
	deleteAiChat,
	getAllAiChatsSortedByDateDesc,
	getChatMessagesOrdered,
	renameAiChat,
} from "../../../../api/aiIntegration/api/aiApi";
import ChatDto from "../../../../api/aiIntegration/dto/chatDto";
import MessageDto from "../../../../api/aiIntegration/dto/messageDto";

vi.mock(import("../../../../api/aiIntegration/api/aiApi"));

const chat1: ChatDto = { id: "chat-1", title: "Chat 1", createdDate: "date" };
const chat2: ChatDto = { id: "chat-2", title: "Chat 2", createdDate: "date" };

const message1: MessageDto = {
	id: "message-1",
	createdDate: "date",
	chatId: "chat-1",
	content: { type: "human", value: "hi" },
	contextSnippets: [],
};

describe("useAiChats", () => {
	beforeEach(() => window.localStorage.clear());

	it("Should populate chats when refreshChats resolves", async () => {
		// Arrange

		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([
			chat1,
			chat2,
		]);

		// Act

		const { result } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.refreshChats();
		});

		// Assert

		expect(result.current.chats).toEqual([chat1, chat2]);
	});

	it("Should set errorMessage when refreshChats fails", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(getAllAiChatsSortedByDateDesc).mockRejectedValue(
			new Error("Could not load chats"),
		);

		// Act

		const { result } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.refreshChats();
		});

		// Assert

		expect(result.current.errorMessage).toBe("Could not load chats");
	});

	it("Should select the chat and load its messages when opening a chat", async () => {
		// Arrange

		vi.mocked(getChatMessagesOrdered).mockResolvedValue([message1]);

		// Act

		const { result } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		// Assert

		expect(result.current.selectedChatId).toBe("chat-1");
		expect(result.current.messages).toEqual([message1]);
	});

	it("Should clear the selected chat and messages when starting a new chat", async () => {
		// Arrange

		vi.mocked(getChatMessagesOrdered).mockResolvedValue([message1]);

		const { result } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		// Act

		act(() => {
			result.current.startNewChat();
		});

		// Assert

		expect(result.current.selectedChatId).toBeNull();
		expect(result.current.messages).toEqual([]);
	});

	it("Should remove the chat from the list and start a new chat when deleting the selected chat", async () => {
		// Arrange

		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([
			chat1,
			chat2,
		]);
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.refreshChats();
			await result.current.openChat("chat-1");
		});

		// Act

		await act(async () => {
			await result.current.removeChat("chat-1");
		});

		// Assert

		expect(deleteAiChat).toHaveBeenCalledWith("chat-1");
		expect(result.current.chats).toEqual([chat2]);
		expect(result.current.selectedChatId).toBeNull();
	});

	it("Should keep the current selection when deleting a chat that is not selected", async () => {
		// Arrange

		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([
			chat1,
			chat2,
		]);
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.refreshChats();
			await result.current.openChat("chat-1");
		});

		// Act

		await act(async () => {
			await result.current.removeChat("chat-2");
		});

		// Assert

		expect(result.current.chats).toEqual([chat1]);
		expect(result.current.selectedChatId).toBe("chat-1");
	});

	it("Should update the chat title when renaming a chat", async () => {
		// Arrange

		vi.mocked(getAllAiChatsSortedByDateDesc).mockResolvedValue([
			chat1,
			chat2,
		]);

		const { result } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.refreshChats();
		});

		// Act

		await act(async () => {
			await result.current.renameChat("chat-1", "New name");
		});

		// Assert

		expect(renameAiChat).toHaveBeenCalledWith("chat-1", "New name");
		expect(result.current.chats).toEqual([
			{ ...chat1, title: "New name" },
			chat2,
		]);
	});

	it("Should restore the selected chat and its messages when remounted", async () => {
		// Arrange

		vi.mocked(getChatMessagesOrdered).mockResolvedValue([message1]);
		const { result, unmount } = renderHook(() => useAiChats());
		await act(async () => {
			await result.current.openChat("chat-1");
		});
		unmount();

		// Act

		const { result: remounted } = renderHook(() => useAiChats());
		await act(() => Promise.resolve());

		// Assert

		expect(remounted.current.selectedChatId).toBe("chat-1");
		expect(remounted.current.messages).toEqual([message1]);
	});
});
