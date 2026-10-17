import { describe, expect, it } from "vitest";
import { buildDisplayMessages } from "../../../features/Ai/utils/buildDisplayMessages";
import MessageDto from "../../../api/aiIntegration/dto/messageDto";

function makeMessage(id: string): MessageDto {
	return {
		id,
		createdDate: "2026-01-01T00:00:00Z",
		chatId: "chat-1",
		content: { type: "human", value: `message ${id}` },
		contextSnippets: [],
	};
}

describe("buildDisplayMessages", () => {
	it("Should return only the persisted messages when nothing is streaming", () => {
		// Arrange

		const persisted = [makeMessage("1"), makeMessage("2")];

		// Act

		const actual = buildDisplayMessages(persisted, null, null);

		// Assert

		expect(actual.map(m => m.id)).toEqual(["1", "2"]);
	});

	it("Should append a pending human message and a streaming assistant message when both are in flight", () => {
		// Arrange

		const persisted = [makeMessage("1")];

		// Act

		const actual = buildDisplayMessages(persisted, "Hi there", "Hello");

		// Assert

		expect(actual).toEqual([
			{ id: "1", content: { type: "human", value: "message 1" } },
			{
				id: "pending-human",
				content: { type: "human", value: "Hi there" },
			},
			{
				id: "pending-assistant",
				content: { type: "assistant", value: "Hello" },
				isStreaming: true,
			},
		]);
	});

	it("Should omit the streaming assistant entry when the streaming text is null", () => {
		// Arrange

		const persisted: MessageDto[] = [];

		// Act

		const actual = buildDisplayMessages(persisted, "Prompt", null);

		// Assert

		expect(actual).toEqual([
			{
				id: "pending-human",
				content: { type: "human", value: "Prompt" },
			},
		]);
	});

	it("Should append a pending, streaming document message when a document is uploading", () => {
		// Arrange

		const persisted: MessageDto[] = [];

		// Act

		const actual = buildDisplayMessages(persisted, null, null, "notes.pdf");

		// Assert

		expect(actual).toEqual([
			{
				id: "pending-document",
				content: { type: "document", value: { fileName: "notes.pdf" } },
				isStreaming: true,
			},
		]);
	});

	it("Should omit the pending document entry when no document is uploading", () => {
		// Arrange

		const persisted = [makeMessage("1")];

		// Act

		const actual = buildDisplayMessages(persisted, null, null, null);

		// Assert

		expect(actual.map(m => m.id)).toEqual(["1"]);
	});

	it("Should include a persisted message's context snippets when present", () => {
		// Arrange

		const persisted: MessageDto[] = [
			{ ...makeMessage("1"), contextSnippets: ["Selected passage"] },
		];

		// Act

		const actual = buildDisplayMessages(persisted, null, null);

		// Assert

		expect(actual[0].contextSnippets).toEqual(["Selected passage"]);
	});

	it("Should attach pending context snippets to the pending human message", () => {
		// Arrange

		const persisted: MessageDto[] = [];

		// Act

		const actual = buildDisplayMessages(persisted, "Prompt", null, null, [
			"Selected passage",
		]);

		// Assert

		expect(actual).toEqual([
			{
				id: "pending-human",
				content: { type: "human", value: "Prompt" },
				contextSnippets: ["Selected passage"],
			},
		]);
	});

	it("Should place streaming tool messages between the pending human message and the streaming assistant message", () => {
		// Arrange

		const persisted: MessageDto[] = [];

		// Act

		const actual = buildDisplayMessages(
			persisted,
			"Prompt",
			"Answer",
			null,
			null,
			[
				{
					id: "streaming-tool-call-tc-1",
					content: {
						type: "toolCall",
						value: {
							id: "tc-1",
							name: "search_documents",
							arguments: {},
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
			],
		);

		// Assert

		expect(actual.map(m => m.id)).toEqual([
			"pending-human",
			"streaming-tool-call-tc-1",
			"streaming-tool-result-tc-1",
			"pending-assistant",
		]);
	});

	it("Should resolve a streaming toolResult's name from the matching streaming toolCall", () => {
		// Arrange

		const persisted: MessageDto[] = [];

		// Act

		const actual = buildDisplayMessages(persisted, null, null, null, null, [
			{
				id: "streaming-tool-call-tc-1",
				content: {
					type: "toolCall",
					value: {
						id: "tc-1",
						name: "search_documents",
						arguments: {},
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

		// Assert

		expect(actual.map(m => m.toolName)).toEqual([
			"search_documents",
			"search_documents",
		]);
	});

	it("Should attach the approval and hide its tool result when a call awaiting approval is persisted", () => {
		// Arrange

		const persisted: MessageDto[] = [
			{
				id: "m-1",
				createdDate: "date",
				chatId: "chat-1",
				content: {
					type: "toolCall",
					value: {
						id: "tc-1",
						name: "create_card",
						arguments: { front: "Q", back: "A" },
						approval: { context: null, status: "pending" },
					},
				},
				contextSnippets: [],
				approvalMarkdown: "**Front**",
			},
			{
				id: "m-2",
				createdDate: "date",
				chatId: "chat-1",
				content: {
					type: "toolResult",
					value: { id: "tc-1", text: "Awaiting approval." },
				},
				contextSnippets: [],
			},
		];

		// Act

		const actual = buildDisplayMessages(persisted, null, null);

		// Assert

		expect(actual.map(m => [m.id, m.approval])).toEqual([
			[
				"m-1",
				{ messageId: "m-1", status: "pending", markdown: "**Front**" },
			],
		]);
	});

	it("Should prefer the resolved status and result over the loaded ones when an approval was resolved since", () => {
		// Arrange

		const persisted: MessageDto[] = [];

		// Act

		const actual = buildDisplayMessages(
			persisted,
			null,
			null,
			null,
			null,
			[
				{
					id: "streaming-tool-call-tc-1",
					messageId: "m-1",
					approvalMarkdown: "**Front**",
					content: {
						type: "toolCall",
						value: {
							id: "tc-1",
							name: "create_card",
							arguments: {},
							approval: { context: null, status: "pending" },
						},
					},
				},
			],
			{ "m-1": { status: "approved", resultMarkdown: "Created it" } },
		);

		// Assert

		expect(actual[0].approval).toEqual({
			messageId: "m-1",
			status: "approved",
			markdown: "**Front**",
			resultMarkdown: "Created it",
		});
	});
});
