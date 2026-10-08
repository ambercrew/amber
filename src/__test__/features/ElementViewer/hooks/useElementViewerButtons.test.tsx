import { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	COMMAND_PRIORITY_EDITOR,
	createEditor,
	LexicalEditor,
	LexicalNode,
	RangeSelection,
	TextNode,
} from "lexical";
import { type MantineColor } from "@mantine/core";
import {
	$createHighlightNode,
	HighlightNode,
} from "../../../../components/Editor/plugins/HighlightPlugin/HighlightNode";
import { CREATE_HIGHLIGHT_COMMAND } from "../../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { useElementViewerButtons } from "../../../../features/ElementViewer/hooks/useElementViewerButtons";
import { FloatingMenuButton } from "../../../../components/Editor/plugins/FloatingMenuPlugin";
import { setupStore } from "../../../../stores/store";
import SettingsDto from "../../../../api/settings/dto/settingsDto";
import type { trashElementAction } from "../../../../stores/trash/trashActions";
import { NodeDto } from "../../../../api/elements/dto/nodeDto";
import { ElementId } from "../../../../types/elements/elementId";

const { mockNavigate, mockTrashElementAction } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
	mockTrashElementAction: vi.fn<typeof trashElementAction>(
		() => async () => undefined,
	),
}));

vi.mock(
	import("../../../../stores/trash/trashActions"),
	async importOriginal => {
		const actual = await importOriginal();
		return { ...actual, trashElementAction: mockTrashElementAction };
	},
);

vi.mock(import("react-router"), async importOriginal => {
	const actual = await importOriginal();
	return { ...actual, useNavigate: () => mockNavigate };
});

const BASE_SETTINGS: SettingsDto = {
	baseDatabaseDirectory: "/home/user/amber",
	theme: "Light",
	font: { type: "systemDefault" },
	fontHeadings: { type: "systemDefault" },
	fontMonospace: { type: "systemDefault" },
	zoomPercentage: 100,
	autoSync: true,
	trashRetentionDays: 30,
	enableAi: false,
	aiProvider: "ollama",
	aiProviders: {
		ollama: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
		openAI: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
		openRouter: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
		gemini: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
	},
};

interface Segment {
	text: string;
	highlight?: { id: string; color: MantineColor };
}

function makeTreeNode(elementId: ElementId): NodeDto {
	return {
		meta: { elementId, name: elementId.id, position: "a" },
		children: { folders: [], learningAssets: [], extracts: [], cards: [] },
	};
}

function makeStore(enableAi = false, existing: ElementId[] = []) {
	return setupStore({
		settings: { settings: { ...BASE_SETTINGS, enableAi } },
		elements: {
			tree: existing.map(makeTreeNode),
			isLoading: false,
			error: null,
			currentElement: null,
			zoomOwnedByCurrentView: false,
		},
	});
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
	return function Wrapper({ children }: PropsWithChildren) {
		return (
			<MemoryRouter>
				<Provider store={store}>{children}</Provider>
			</MemoryRouter>
		);
	};
}

function renderViewerButtons(
	store: ReturnType<typeof makeStore> = makeStore(),
) {
	return renderHook(() => useElementViewerButtons(), {
		wrapper: makeWrapper(store),
	}).result;
}

function renderButtons(store: ReturnType<typeof makeStore> = makeStore()) {
	return renderViewerButtons(store).current.buttons;
}

function findButton(
	buttons: ReturnType<typeof renderButtons>,
	name: string,
): FloatingMenuButton {
	const button = buttons.find(
		(b): b is FloatingMenuButton => !("divider" in b) && b.name === name,
	);
	if (!button) throw new Error(`Button "${name}" not found`);
	return button;
}

function getButton(
	name: string,
	store: ReturnType<typeof makeStore> = makeStore(),
): FloatingMenuButton {
	return findButton(renderButtons(store), name);
}

function createTestEditor(): LexicalEditor {
	return createEditor({
		namespace: "test",
		nodes: [HighlightNode],
		onError: error => {
			throw error;
		},
	});
}

function setContent(editor: LexicalEditor, segments: Segment[]) {
	editor.update(
		() => {
			const root = $getRoot();
			root.clear();
			const paragraph = $createParagraphNode();
			for (const segment of segments) {
				if (segment.highlight) {
					const mark = $createHighlightNode(
						[segment.highlight.id],
						segment.highlight.color,
					);
					mark.append($createTextNode(segment.text));
					paragraph.append(mark);
				} else {
					paragraph.append($createTextNode(segment.text));
				}
			}
			root.append(paragraph);
		},
		{ discrete: true },
	);
}

function getInnerTextNode(node: LexicalNode | null): TextNode {
	if ($isTextNode(node)) return node;
	if ($isElementNode(node)) {
		const child = node.getFirstChild();
		if ($isTextNode(child)) return child;
	}
	throw new Error("Expected a text node");
}

function selectSegments(
	editor: LexicalEditor,
	startIndex: number,
	endIndex: number,
) {
	editor.update(
		() => {
			const paragraph = $getRoot().getFirstChild();
			if (!$isElementNode(paragraph))
				throw new Error("Expected paragraph");
			const startNode = getInnerTextNode(
				paragraph.getChildAtIndex(startIndex),
			);
			const endNode = getInnerTextNode(
				paragraph.getChildAtIndex(endIndex),
			);
			const selection = $createRangeSelection();
			selection.anchor.set(startNode.getKey(), 0, "text");
			selection.focus.set(
				endNode.getKey(),
				endNode.getTextContent().length,
				"text",
			);
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

function withSelection<T>(
	editor: LexicalEditor,
	fn: (selection: RangeSelection) => T,
): T {
	let result: T | undefined;
	editor.getEditorState().read(() => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection))
			throw new Error("No range selection");
		result = fn(selection);
	});
	return result as T;
}

function getMarkTagNames(editor: LexicalEditor): string[] {
	return editor.getEditorState().read(() => {
		const paragraph = $getRoot().getFirstChild();
		if (!$isElementNode(paragraph)) return [];
		return paragraph
			.getChildren()
			.filter(node => node instanceof HighlightNode)
			.map(node => (node as HighlightNode).getHighlightId());
	});
}

describe("useElementViewerButtons", () => {
	afterEach(() => {
		mockNavigate.mockReset();
		mockTrashElementAction.mockClear();
	});

	describe("extract button", () => {
		it("Should have no isVisible restriction when button is extract", () => {
			// Arrange

			const button = getButton("extract");

			// Assert

			expect(button.isVisible).toBeUndefined();
		});

		it("Should dispatch CREATE_HIGHLIGHT_COMMAND with yellow when clicked", () => {
			// Arrange

			const button = getButton("extract");
			const editor = createTestEditor();
			let capturedColor: MantineColor | null = null;
			editor.registerCommand(
				CREATE_HIGHLIGHT_COMMAND,
				color => {
					capturedColor = color;
					return true;
				},
				COMMAND_PRIORITY_EDITOR,
			);

			// Act

			button.onClick(editor, false, vi.fn());

			// Assert

			expect(capturedColor).toBe("yellow");
		});
	});

	describe("cloze button", () => {
		it("Should have no isVisible restriction when button is cloze", () => {
			// Arrange

			const button = getButton("cloze");

			// Assert

			expect(button.isVisible).toBeUndefined();
		});

		it("Should dispatch CREATE_HIGHLIGHT_COMMAND with blue when clicked", () => {
			// Arrange

			const button = getButton("cloze");
			const editor = createTestEditor();
			let capturedColor: MantineColor | null = null;
			editor.registerCommand(
				CREATE_HIGHLIGHT_COMMAND,
				color => {
					capturedColor = color;
					return true;
				},
				COMMAND_PRIORITY_EDITOR,
			);

			// Act

			button.onClick(editor, false, vi.fn());

			// Assert

			expect(capturedColor).toBe("blue");
		});
	});

	describe("remove-highlight button", () => {
		function clickRemove(
			result: ReturnType<typeof renderViewerButtons>,
			editor: LexicalEditor,
		) {
			act(() => {
				findButton(result.current.buttons, "remove-highlight").onClick(
					editor,
					false,
					vi.fn(),
				);
			});
		}

		it("Should not be visible when selection has no highlight", () => {
			// Arrange

			const button = getButton("remove-highlight");
			const editor = createTestEditor();
			setContent(editor, [{ text: "Plain text" }]);
			selectSegments(editor, 0, 0);

			// Act

			const isVisible = withSelection(editor, sel =>
				button.isVisible!(sel),
			);

			// Assert

			expect(isVisible).toBe(false);
		});

		it("Should be visible when selection touches a highlight", () => {
			// Arrange

			const button = getButton("remove-highlight");
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "yellow" } },
			]);
			selectSegments(editor, 0, 0);

			// Act

			const isVisible = withSelection(editor, sel =>
				button.isVisible!(sel),
			);

			// Assert

			expect(isVisible).toBe(true);
		});

		it("Should unwrap without confirming when no element of the highlight exists", () => {
			// Arrange

			const result = renderViewerButtons();
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "yellow" } },
			]);
			selectSegments(editor, 0, 0);

			// Act

			clickRemove(result, editor);

			// Assert

			expect(getMarkTagNames(editor)).toEqual([]);
			expect(result.current.pendingHighlightRemoval).toBeNull();
			expect(mockTrashElementAction).not.toHaveBeenCalled();
		});

		it("Should ask for confirmation with only existing elements when clicked", () => {
			// Arrange

			const result = renderViewerButtons(
				makeStore(false, [{ type: "card", id: "id-2" }]),
			);
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "yellow" } },
				{ text: " Bravo " },
				{ text: "Charlie", highlight: { id: "id-2", color: "blue" } },
			]);
			selectSegments(editor, 0, 2);

			// Act

			clickRemove(result, editor);

			// Assert

			expect(result.current.pendingHighlightRemoval).toEqual({
				editor,
				highlightIds: ["id-1", "id-2"],
				elementIds: [{ type: "card", id: "id-2" }],
			});
			expect(getMarkTagNames(editor)).toEqual(["id-1", "id-2"]);
			expect(mockTrashElementAction).not.toHaveBeenCalled();
		});

		it("Should leave the highlight in place when the removal is cancelled", () => {
			// Arrange

			const result = renderViewerButtons(
				makeStore(false, [{ type: "extract", id: "id-1" }]),
			);
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "yellow" } },
			]);
			selectSegments(editor, 0, 0);
			clickRemove(result, editor);

			// Act

			act(() => result.current.cancelHighlightRemoval());

			// Assert

			expect(result.current.pendingHighlightRemoval).toBeNull();
			expect(getMarkTagNames(editor)).toEqual(["id-1"]);
			expect(mockTrashElementAction).not.toHaveBeenCalled();
		});

		it("Should unwrap every node of the highlight and trash its extract when confirmed", () => {
			// Arrange

			const result = renderViewerButtons(
				makeStore(false, [{ type: "extract", id: "id-1" }]),
			);
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "yellow" } },
				{ text: " Bravo " },
				{ text: "Charlie", highlight: { id: "id-1", color: "yellow" } },
				{ text: " Delta " },
				{ text: "Echo", highlight: { id: "id-2", color: "yellow" } },
			]);
			selectSegments(editor, 0, 0);
			clickRemove(result, editor);

			// Act

			act(() => result.current.confirmHighlightRemoval());

			// Assert

			expect(getMarkTagNames(editor)).toEqual(["id-2"]);
			expect(mockTrashElementAction).toHaveBeenCalledExactlyOnceWith({
				type: "extract",
				id: "id-1",
			});
		});

		it("Should trash each existing element once when confirmed after selecting several highlights", () => {
			// Arrange

			const result = renderViewerButtons(
				makeStore(false, [
					{ type: "extract", id: "id-1" },
					{ type: "card", id: "id-2" },
				]),
			);
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "yellow" } },
				{ text: "Bravo", highlight: { id: "id-1", color: "yellow" } },
				{ text: "Charlie", highlight: { id: "id-2", color: "blue" } },
			]);
			selectSegments(editor, 0, 2);
			clickRemove(result, editor);

			// Act

			act(() => result.current.confirmHighlightRemoval());

			// Assert

			expect(getMarkTagNames(editor)).toEqual([]);
			expect(mockTrashElementAction.mock.calls).toEqual([
				[{ type: "extract", id: "id-1" }],
				[{ type: "card", id: "id-2" }],
			]);
		});
	});

	describe("open-highlight button", () => {
		it("Should not be visible when selection has no highlight", () => {
			// Arrange

			const button = getButton("open-highlight");
			const editor = createTestEditor();
			setContent(editor, [{ text: "Plain text" }]);
			selectSegments(editor, 0, 0);

			// Act

			const isVisible = withSelection(editor, sel =>
				button.isVisible!(sel),
			);

			// Assert

			expect(isVisible).toBe(false);
		});

		it("Should be visible when the highlight under selection is an extract", () => {
			// Arrange

			const button = getButton("open-highlight");
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "yellow" } },
			]);
			selectSegments(editor, 0, 0);

			// Act

			const isVisible = withSelection(editor, sel =>
				button.isVisible!(sel),
			);

			// Assert

			expect(isVisible).toBe(true);
		});

		it("Should be visible when the highlight under selection is a cloze", () => {
			// Arrange

			const button = getButton("open-highlight");
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "id-1", color: "blue" } },
			]);
			selectSegments(editor, 0, 0);

			// Act

			const isVisible = withSelection(editor, sel =>
				button.isVisible!(sel),
			);

			// Assert

			expect(isVisible).toBe(true);
		});

		it("Should navigate to the extract when clicked on an extract highlight", () => {
			// Arrange

			const button = getButton("open-highlight");
			const editor = createTestEditor();
			setContent(editor, [
				{
					text: "Alpha",
					highlight: { id: "extract-id", color: "yellow" },
				},
			]);
			selectSegments(editor, 0, 0);

			// Act

			button.onClick(editor, false, vi.fn());

			// Assert

			expect(mockNavigate).toHaveBeenCalledWith("/extract/extract-id");
		});

		it("Should navigate to the card when clicked on a cloze highlight", () => {
			// Arrange

			const button = getButton("open-highlight");
			const editor = createTestEditor();
			setContent(editor, [
				{ text: "Alpha", highlight: { id: "cloze-id", color: "blue" } },
			]);
			selectSegments(editor, 0, 0);

			// Act

			button.onClick(editor, false, vi.fn());

			// Assert

			expect(mockNavigate).toHaveBeenCalledWith("/card/cloze-id");
		});
	});

	describe("add-ai-context button", () => {
		it("Should not be present when AI is disabled", () => {
			// Arrange

			const buttons = renderButtons(makeStore(false));

			// Assert

			expect(
				buttons.some(
					b => !("divider" in b) && b.name === "add-ai-context",
				),
			).toBe(false);
		});

		it("Should be present when AI is enabled", () => {
			// Arrange

			const buttons = renderButtons(makeStore(true));

			// Assert

			expect(
				buttons.some(
					b => !("divider" in b) && b.name === "add-ai-context",
				),
			).toBe(true);
		});

		it("Should add the selected text as a context snippet when clicked", () => {
			// Arrange

			const store = makeStore(true);
			const button = getButton("add-ai-context", store);
			const editor = createTestEditor();
			setContent(editor, [{ text: "Selected passage" }]);
			selectSegments(editor, 0, 0);
			const closeMenu = vi.fn();

			// Act

			button.onClick(editor, false, closeMenu);

			// Assert

			expect(store.getState().ai.snippets).toEqual([
				expect.objectContaining({ text: "Selected passage" }),
			]);
			expect(closeMenu).toHaveBeenCalledOnce();
		});

		it("Should not add an empty snippet when the selection is blank", () => {
			// Arrange

			const store = makeStore(true);
			const button = getButton("add-ai-context", store);
			const editor = createTestEditor();
			setContent(editor, [{ text: "   " }]);
			selectSegments(editor, 0, 0);
			const closeMenu = vi.fn();

			// Act

			button.onClick(editor, false, closeMenu);

			// Assert

			expect(store.getState().ai.snippets).toEqual([]);
			expect(closeMenu).not.toHaveBeenCalled();
		});
	});
});
