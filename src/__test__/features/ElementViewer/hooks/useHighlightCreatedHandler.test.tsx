import { useHighlightCreatedHandler } from "../../../../features/ElementViewer/hooks/useHighlightCreatedHandler";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import {
	createCardAction,
	createExtractAction,
} from "../../../../stores/elements/elementsActions";
import { ElementId } from "../../../../types/elements/elementId";
import { HighlightCreatedPayload } from "../../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { type SerializedLexicalNodeTree } from "../../../../components/Editor/lexicalJsonConversion";

vi.mock(import("../../../../stores/elements/elementsActions"));

const ELEMENT_ID: ElementId = { type: "learningAsset", id: "learningAsset-1" };
function HookWrapper({
	capture,
}: {
	capture: (handler: (payload: HighlightCreatedPayload) => void) => void;
}) {
	capture(useHighlightCreatedHandler(ELEMENT_ID));
	return null;
}

function renderHandler() {
	vi.mocked(createCardAction).mockReturnValue(() => Promise.resolve(true));
	vi.mocked(createExtractAction).mockReturnValue(() => Promise.resolve(true));

	let handleHighlightCreated!: (payload: HighlightCreatedPayload) => void;
	renderWithProviders(
		<HookWrapper capture={handler => (handleHighlightCreated = handler)} />,
	);
	return handleHighlightCreated;
}

// Serialized-node fixture builders, standing in for what
// `$generateJSONFromSelectedNodes` would produce from the live editor.
function text(value: string): SerializedLexicalNodeTree {
	return { type: "text", version: 1, text: value };
}
function paragraph(
	children: SerializedLexicalNodeTree[],
): SerializedLexicalNodeTree {
	return { type: "paragraph", version: 1, children };
}
function highlight(
	id: string,
	color: string,
	children: SerializedLexicalNodeTree[],
): SerializedLexicalNodeTree {
	return { type: "highlight", version: 1, ids: [id], color, children };
}
function clozeHidden(hiddenText: string): SerializedLexicalNodeTree {
	return { type: "cloze-hidden", version: 1, text: "[...]", hiddenText };
}

// Assertion helpers over the persisted editor-state JSON produced by the
// handler (parsing it back out is the simplest way to verify the real
// strip/cloze-build logic ran against real Lexical nodes).
function parseRoot(json: string): SerializedLexicalNodeTree {
	return (JSON.parse(json) as { root: SerializedLexicalNodeTree }).root;
}
function collectText(node: SerializedLexicalNodeTree): string {
	if (typeof node.text === "string") return node.text;
	return (node.children ?? []).map(collectText).join("");
}
function collectByType(
	node: SerializedLexicalNodeTree,
	type: string,
	out: SerializedLexicalNodeTree[] = [],
): SerializedLexicalNodeTree[] {
	if (node.type === type) out.push(node);
	(node.children ?? []).forEach(child => collectByType(child, type, out));
	return out;
}

describe("useHighlightCreatedHandler", () => {
	it("Should create a card with a hidden cloze front and a plain-text back when color is blue", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();
		const fullNodes = [
			paragraph([
				text("A "),
				highlight("other-id", "yellow", [text("Old")]),
				text(" B "),
				highlight("new-id", "blue", [text("New Text")]),
				text(" C"),
			]),
		];

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes: [text("New Text")],
			fullNodes,
			selectionText: "New Text",
			fullText: "A Old B New Text C",
			color: "blue",
			endBlockIndex: 0,
		});

		// Assert

		const dto = vi.mocked(createCardAction).mock.calls[0][0];
		expect(dto.id).toBe("new-id");
		expect(dto.meta).toEqual({
			name: "A Old B New Text C",
			parent: ELEMENT_ID,
			origin: { type: "inherited" },
		});

		const frontRoot = parseRoot(dto.front);
		expect(collectText(frontRoot)).toBe("A Old B [...] C");
		expect(collectByType(frontRoot, "highlight")).toHaveLength(0);
		const frontClozes = collectByType(frontRoot, "cloze-hidden");
		expect(frontClozes).toHaveLength(1);
		expect(frontClozes[0].text).toBe("[...]");
		expect(frontClozes[0].hiddenText).toBe("New Text");

		expect(collectText(parseRoot(dto.back))).toBe("New Text");
	});

	it("Should name the card from the full document's plain text rather than the back text", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();
		const fullNodes = [
			paragraph([
				text("Some context before "),
				highlight("new-id", "blue", [text("the answer")]),
				text(" and after"),
			]),
		];

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes: [text("the answer")],
			fullNodes,
			selectionText: "the answer",
			fullText: "Some context before the answer and after",
			color: "blue",
			endBlockIndex: 0,
		});

		// Assert

		expect(createCardAction).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({
					name: "Some context before the answer and after",
				}) as object,
			}),
		);
	});

	it("Should truncate the card name to 50 characters", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();
		const longText = "A".repeat(60);

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes: [text(longText)],
			fullNodes: [
				paragraph([highlight("new-id", "blue", [text(longText)])]),
			],
			selectionText: longText,
			fullText: longText,
			color: "blue",
			endBlockIndex: 0,
		});

		// Assert

		expect(createCardAction).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({
					name: "A".repeat(50),
				}) as object,
			}),
		);
	});

	it("Should create an extract stripped of other highlights when color is not blue", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes: [
				paragraph([
					highlight("other-id", "yellow", [text("Nested")]),
					text(" Rest"),
				]),
			],
			fullNodes: [paragraph([text("irrelevant")])],
			selectionText: "Nested Rest",
			fullText: "irrelevant",
			color: "yellow",
			endBlockIndex: 0,
		});

		// Assert

		const dto = vi.mocked(createExtractAction).mock.calls[0][0];
		expect(dto.id).toBe("new-id");
		expect(dto.meta).toEqual({
			name: "Nested Rest",
			parent: ELEMENT_ID,
			origin: { type: "inherited" },
		});
		expect(collectText(parseRoot(dto.content))).toBe("Nested Rest");
		expect(createCardAction).not.toHaveBeenCalled();
	});

	it("Should strip every other highlight from the cloze front and back when there is more than one", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();
		const fullNodes = [
			paragraph([
				highlight("other-id-1", "yellow", [text("First")]),
				text(" "),
				highlight("other-id-2", "yellow", [text("Second")]),
				text(" "),
				highlight("new-id", "blue", [text("New Text")]),
				text(" "),
				highlight("other-id-3", "blue", [text("Third")]),
			]),
		];
		const selectionNodes = [
			paragraph([
				highlight("other-id-4", "yellow", [text("Old")]),
				text(" New Text"),
			]),
		];

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes,
			fullNodes,
			selectionText: "Old New Text",
			fullText: "First Second New Text Third",
			color: "blue",
			endBlockIndex: 0,
		});

		// Assert

		const dto = vi.mocked(createCardAction).mock.calls[0][0];
		expect(dto.meta).toEqual({
			name: "First Second New Text Third",
			parent: ELEMENT_ID,
			origin: { type: "inherited" },
		});

		const frontRoot = parseRoot(dto.front);
		expect(collectText(frontRoot)).toBe("First Second [...] Third");
		expect(collectByType(frontRoot, "highlight")).toHaveLength(0);
		const frontClozes = collectByType(frontRoot, "cloze-hidden");
		expect(frontClozes).toHaveLength(1);
		expect(frontClozes[0].text).toBe("[...]");
		expect(frontClozes[0].hiddenText).toBe("New Text");

		expect(collectText(parseRoot(dto.back))).toBe("Old New Text");
	});

	it("Should unwrap a pre-existing cloze-hidden marker from the front and back when creating a new cloze card", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();
		const fullNodes = [
			paragraph([
				clozeHidden("Old Cloze"),
				text(" "),
				highlight("new-id", "blue", [text("New Text")]),
			]),
		];
		const selectionNodes = [
			paragraph([
				text("Before "),
				clozeHidden("Old Cloze"),
				text(" New Text"),
			]),
		];

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes,
			fullNodes,
			selectionText: "Before Old Cloze New Text",
			fullText: "Old Cloze New Text",
			color: "blue",
			endBlockIndex: 0,
		});

		// Assert

		const dto = vi.mocked(createCardAction).mock.calls[0][0];
		expect(dto.meta).toEqual({
			name: "Old Cloze New Text",
			parent: ELEMENT_ID,
			origin: { type: "inherited" },
		});

		const frontRoot = parseRoot(dto.front);
		expect(collectText(frontRoot)).toBe("Old Cloze [...]");
		const frontClozes = collectByType(frontRoot, "cloze-hidden");
		expect(frontClozes).toHaveLength(1);
		expect(frontClozes[0].text).toBe("[...]");
		expect(frontClozes[0].hiddenText).toBe("New Text");

		expect(collectText(parseRoot(dto.back))).toBe(
			"Before Old Cloze New Text",
		);
	});

	it("Should unwrap a pre-existing cloze-hidden marker from the extract content when creating a new extract", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes: [
				paragraph([
					text("Before "),
					clozeHidden("Old Cloze"),
					text(" Rest"),
				]),
			],
			fullNodes: [paragraph([text("irrelevant")])],
			selectionText: "Before Old Cloze Rest",
			fullText: "irrelevant",
			color: "yellow",
			endBlockIndex: 0,
		});

		// Assert

		const dto = vi.mocked(createExtractAction).mock.calls[0][0];
		expect(dto.meta).toEqual({
			name: "Before Old Cloze Rest",
			parent: ELEMENT_ID,
			origin: { type: "inherited" },
		});
		expect(collectText(parseRoot(dto.content))).toBe(
			"Before Old Cloze Rest",
		);
	});

	it("Should strip every other highlight from the extract content when there is more than one", () => {
		// Arrange

		const handleHighlightCreated = renderHandler();

		// Act

		handleHighlightCreated({
			id: "new-id",
			selectionNodes: [
				paragraph([
					highlight("other-id-1", "yellow", [text("First")]),
					text(" Middle "),
					highlight("other-id-2", "blue", [text("Second")]),
				]),
			],
			fullNodes: [paragraph([text("irrelevant")])],
			selectionText: "First Middle Second",
			fullText: "irrelevant",
			color: "yellow",
			endBlockIndex: 0,
		});

		// Assert

		const dto = vi.mocked(createExtractAction).mock.calls[0][0];
		expect(dto.meta).toEqual({
			name: "First Middle Second",
			parent: ELEMENT_ID,
			origin: { type: "inherited" },
		});
		expect(collectText(parseRoot(dto.content))).toBe("First Middle Second");
	});
});
