import { act, renderHook } from "@testing-library/react";
import useAiChats from "../../../../features/Ai/hooks/useAiChats";
import useAiDocumentUpload from "../../../../features/Ai/hooks/useAiDocumentUpload";
import {
	createAiChat,
	deleteAiChat,
	getChatMessagesOrdered,
	uploadDocument,
} from "../../../../api/aiIntegration/api/aiApi";
import UploadOutcomeDto from "../../../../api/aiIntegration/dto/uploadOutcomeDto";
import ChatDto from "../../../../api/aiIntegration/dto/chatDto";
import MessageDto from "../../../../api/aiIntegration/dto/messageDto";

vi.mock(import("../../../../api/aiIntegration/api/aiApi"));

const chat1: ChatDto = { id: "chat-1", title: "Chat 1", createdDate: "date" };

// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() {}

// `useAiDocumentUpload` relies on state/setters owned by `useAiChats` (the
// same way `AiPanel` composes them), so tests exercise both together.
function useTestHarness() {
	const chats = useAiChats();
	const upload = useAiDocumentUpload(chats);
	return { ...chats, ...upload };
}

describe("useAiDocumentUpload", () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.mocked(uploadDocument).mockResolvedValue("uploaded");
	});

	it("Should create a new chat named after the file when no chat is selected", async () => {
		// Arrange

		vi.mocked(createAiChat).mockResolvedValue(chat1);
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness());

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(createAiChat).toHaveBeenCalledWith("notes.pdf");
		expect(uploadDocument).toHaveBeenCalledWith(
			"/home/user/notes.pdf",
			"chat-1",
		);
		expect(result.current.selectedChatId).toBe("chat-1");
		expect(result.current.chats).toEqual([chat1]);
	});

	it("Should upload to the currently selected chat without creating a new one", async () => {
		// Arrange

		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness());
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(createAiChat).not.toHaveBeenCalled();
		expect(uploadDocument).toHaveBeenCalledWith(
			"/home/user/notes.pdf",
			"chat-1",
		);
	});

	it("Should set isUploading synchronously while uploading and clear it once done", async () => {
		// Arrange

		vi.mocked(createAiChat).mockResolvedValue(chat1);
		vi.mocked(uploadDocument).mockImplementation(() => new Promise(noop));

		const { result } = renderHook(() => useTestHarness());

		// Act

		await act(async () => {
			void result.current.uploadDocumentToChat("/home/user/notes.pdf");
			await Promise.resolve();
		});

		// Assert

		expect(result.current.isUploading).toBe(true);
	});

	it("Should clear isUploading once the upload resolves", async () => {
		// Arrange

		vi.mocked(createAiChat).mockResolvedValue(chat1);
		vi.mocked(uploadDocument).mockResolvedValue("uploaded");
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness());

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(result.current.isUploading).toBe(false);
	});

	it("Should set pendingDocumentFileName synchronously while uploading and clear it once done", async () => {
		// Arrange

		vi.mocked(createAiChat).mockResolvedValue(chat1);
		vi.mocked(uploadDocument).mockImplementation(() => new Promise(noop));

		const { result } = renderHook(() => useTestHarness());

		// Act

		await act(async () => {
			void result.current.uploadDocumentToChat("/home/user/notes.pdf");
			await Promise.resolve();
		});

		// Assert

		expect(result.current.pendingDocumentFileName).toBe("notes.pdf");
	});

	it("Should clear pendingDocumentFileName once the upload resolves", async () => {
		// Arrange

		vi.mocked(createAiChat).mockResolvedValue(chat1);
		vi.mocked(uploadDocument).mockResolvedValue("uploaded");
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness());

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(result.current.pendingDocumentFileName).toBeNull();
	});

	it("Should hide pendingDocumentFileName when the user switches to a different chat", async () => {
		// Arrange

		vi.mocked(uploadDocument).mockImplementation(() => new Promise(noop));
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness());
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		await act(async () => {
			void result.current.uploadDocumentToChat("/home/user/notes.pdf");
			await Promise.resolve();
		});

		// Act

		await act(async () => {
			await result.current.openChat("chat-2");
		});

		// Assert

		expect(result.current.pendingDocumentFileName).toBeNull();
	});

	it("Should not overwrite the currently viewed chat's messages when the user switches chats before the upload finishes", async () => {
		// Arrange

		const chat1Messages: MessageDto[] = [
			{
				id: "message-1",
				createdDate: "date",
				chatId: "chat-1",
				content: { type: "human", value: "chat 1" },
				contextSnippets: [],
			},
		];
		const chat2Messages: MessageDto[] = [
			{
				id: "message-2",
				createdDate: "date",
				chatId: "chat-2",
				content: { type: "human", value: "chat 2" },
				contextSnippets: [],
			},
		];

		let resolveUpload: (outcome: UploadOutcomeDto) => void = noop;
		vi.mocked(uploadDocument).mockImplementation(
			() =>
				new Promise(resolve => {
					resolveUpload = resolve;
				}),
		);
		vi.mocked(getChatMessagesOrdered).mockImplementation(chatId =>
			Promise.resolve(
				chatId === "chat-1" ? chat1Messages : chat2Messages,
			),
		);

		const { result } = renderHook(() => useTestHarness());
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		let uploadPromise!: Promise<void>;
		await act(async () => {
			uploadPromise = result.current.uploadDocumentToChat(
				"/home/user/notes.pdf",
			);
			await Promise.resolve();
		});

		// Act

		await act(async () => {
			await result.current.openChat("chat-2");
		});
		await act(async () => {
			resolveUpload("uploaded");
			await uploadPromise;
		});

		// Assert

		expect(result.current.selectedChatId).toBe("chat-2");
		expect(result.current.messages).toEqual(chat2Messages);
	});

	it("Should delete the chat created for the file when the upload is stopped", async () => {
		// Arrange

		vi.mocked(createAiChat).mockResolvedValue(chat1);
		vi.mocked(uploadDocument).mockResolvedValue("stopped");

		const { result } = renderHook(() => useTestHarness());

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(deleteAiChat).toHaveBeenCalledWith("chat-1");
		expect(result.current.chats).toEqual([]);
		expect(result.current.selectedChatId).toBeNull();
	});

	it("Should keep the selected chat when an upload to it is stopped", async () => {
		// Arrange

		vi.mocked(uploadDocument).mockResolvedValue("stopped");
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness());
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(deleteAiChat).not.toHaveBeenCalled();
		expect(result.current.selectedChatId).toBe("chat-1");
	});

	it("Should delete the chat created for the file and show the error when the upload fails", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(createAiChat).mockResolvedValue(chat1);
		vi.mocked(uploadDocument).mockRejectedValue(
			new Error("Unreadable PDF"),
		);
		vi.mocked(deleteAiChat).mockResolvedValue(undefined);

		const { result } = renderHook(() => useTestHarness());

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(deleteAiChat).toHaveBeenCalledWith("chat-1");
		expect(result.current.chats).toEqual([]);
		expect(result.current.selectedChatId).toBeNull();
		expect(result.current.errorMessage).toBe("Unreadable PDF");
	});

	it("Should keep the selected chat when an upload to it fails", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(uploadDocument).mockRejectedValue(
			new Error("Unreadable PDF"),
		);
		vi.mocked(getChatMessagesOrdered).mockResolvedValue([]);

		const { result } = renderHook(() => useTestHarness());
		await act(async () => {
			await result.current.openChat("chat-1");
		});

		// Act

		await act(async () => {
			await result.current.uploadDocumentToChat("/home/user/notes.pdf");
		});

		// Assert

		expect(deleteAiChat).not.toHaveBeenCalled();
		expect(result.current.selectedChatId).toBe("chat-1");
	});
});
