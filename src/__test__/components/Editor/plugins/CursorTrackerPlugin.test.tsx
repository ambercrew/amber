import { useEffect } from "react";
import { act } from "@testing-library/react";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
	$createNodeSelection,
	$createParagraphNode,
	$createTextNode,
	$getNodeByKey,
	$getRoot,
	$setSelection,
	LexicalEditor,
	defineExtension,
} from "lexical";
import CursorTrackerPlugin from "../../../../components/Editor/plugins/CursorTrackerPlugin";
import { ImagePlugin } from "../../../../components/Editor/plugins/ImagePlugin/ImagePlugin";
import { ImageNode } from "../../../../components/Editor/plugins/ImagePlugin/ImageNode";
import { INSERT_IMAGE_COMMAND } from "../../../../components/Editor/plugins/ImagePlugin/imageCommands";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

function EditorCapture({
	onReady,
}: {
	onReady: (editor: LexicalEditor) => void;
}) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => onReady(editor), [editor, onReady]);
	return null;
}

const TEST_EXTENSION = defineExtension({
	name: "test",
	namespace: "test",
	nodes: [ImageNode],
	onError: error => {
		throw error;
	},
});

function renderEditor(onCursorMove: (blockIndex: number) => void) {
	let capturedEditor: LexicalEditor | null = null;

	const { unmount } = renderWithProviders(
		<LexicalExtensionComposer
			extension={TEST_EXTENSION}
			contentEditable={null}>
			<RichTextPlugin
				contentEditable={<ContentEditable aria-label="editor" />}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<ImagePlugin />
			<CursorTrackerPlugin onCursorMove={onCursorMove} />
			<EditorCapture
				onReady={editor => {
					capturedEditor = editor;
				}}
			/>
		</LexicalExtensionComposer>,
	);

	if (!capturedEditor) throw new Error("Editor was not captured");
	return { editor: capturedEditor as LexicalEditor, unmount };
}

/** Runs `fn` inside `act` and flushes Lexical's pending update microtask. */
async function flush(fn: () => void) {
	await act(async () => {
		fn();
		await Promise.resolve();
	});
}

async function insertParagraphs(editor: LexicalEditor, ...texts: string[]) {
	const nodeKeys: string[] = [];
	await flush(() => {
		editor.update(() => {
			const root = $getRoot().clear();
			for (const text of texts) {
				const paragraph = $createParagraphNode();
				const textNode = $createTextNode(text);
				paragraph.append(textNode);
				root.append(paragraph);
				nodeKeys.push(textNode.getKey());
			}
		});
	});
	return nodeKeys;
}

async function insertImage(editor: LexicalEditor) {
	await flush(() => {
		editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
			src: "data:image/png;base64,iVBORw0KGgo=",
			altText: "a cat",
		});
	});
}

function getParagraphElements(editor: LexicalEditor) {
	return editor.getRootElement()!.querySelectorAll("p");
}

describe("CursorTrackerPlugin", () => {
	it("Should report the block index when the caret moves via a range selection", async () => {
		// Arrange

		const onCursorMove = vi.fn();
		const { editor } = renderEditor(onCursorMove);
		const nodeKeys = await insertParagraphs(editor, "first", "second");

		// Act

		await flush(() => {
			editor.update(() => {
				const node = editor.getEditorState()._nodeMap.get(nodeKeys[1]);
				node!.selectEnd();
			});
		});

		// Assert

		expect(onCursorMove).toHaveBeenLastCalledWith(1);
	});

	it("Should report the block index when a node selection is set", async () => {
		// Arrange

		const onCursorMove = vi.fn();
		const { editor } = renderEditor(onCursorMove);
		const nodeKeys = await insertParagraphs(editor, "first", "second");

		// Act

		await flush(() => {
			editor.update(() => {
				const selection = $createNodeSelection();
				selection.add(nodeKeys[0]);
				$setSelection(selection);
			});
		});

		// Assert

		expect(onCursorMove).toHaveBeenLastCalledWith(0);
	});

	it("Should report the image's own block on a contextmenu event, ignoring a stale caret left in another block", async () => {
		// Arrange

		const onCursorMove = vi.fn();
		const { editor } = renderEditor(onCursorMove);
		const [firstKey, secondKey] = await insertParagraphs(
			editor,
			"first",
			"second",
		);
		await flush(() => {
			editor.update(() => $getNodeByKey(secondKey)!.selectEnd());
		});
		await insertImage(editor);
		// Move the caret back to the first block, simulating a stale caret
		// that predates the right-click on the image in the second block.
		await flush(() => {
			editor.update(() => $getNodeByKey(firstKey)!.selectEnd());
		});
		onCursorMove.mockClear();
		const img = editor.getRootElement()!.querySelector("img")!;

		// Act

		await flush(() => {
			img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		});

		// Assert

		expect(onCursorMove).toHaveBeenCalledWith(1);
	});

	it("Should report the correct block index on a contextmenu event over a text block", async () => {
		// Arrange

		const onCursorMove = vi.fn();
		const { editor } = renderEditor(onCursorMove);
		await insertParagraphs(editor, "first", "second", "third");
		onCursorMove.mockClear();
		const paragraphs = getParagraphElements(editor);

		// Act

		await flush(() => {
			paragraphs[2].dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true }),
			);
		});

		// Assert

		expect(onCursorMove).toHaveBeenCalledWith(2);
	});

	it("Should not call onCursorMove when a contextmenu event targets an element outside the editor", async () => {
		// Arrange

		const onCursorMove = vi.fn();
		const { editor } = renderEditor(onCursorMove);
		await insertParagraphs(editor, "first");
		onCursorMove.mockClear();
		const outside = document.createElement("div");
		document.body.appendChild(outside);

		// Act

		await flush(() => {
			outside.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true }),
			);
		});

		// Assert

		expect(onCursorMove).not.toHaveBeenCalled();

		outside.remove();
	});

	it("Should stop reporting contextmenu events on the previous root after the editor unmounts", async () => {
		// Arrange

		const onCursorMove = vi.fn();
		const { editor, unmount } = renderEditor(onCursorMove);
		await insertParagraphs(editor, "first");
		const paragraph = getParagraphElements(editor)[0];
		onCursorMove.mockClear();

		// Act

		await flush(() => unmount());
		await flush(() => {
			paragraph.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true }),
			);
		});

		// Assert

		expect(onCursorMove).not.toHaveBeenCalled();
	});
});
