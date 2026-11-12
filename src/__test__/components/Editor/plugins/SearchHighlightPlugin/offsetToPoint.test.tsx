import { useEffect } from "react";
import { act } from "@testing-library/react";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	LexicalEditor,
	defineExtension,
} from "lexical";
import {
	buildOffsetMap,
	offsetToPoint,
} from "../../../../../components/Editor/plugins/SearchHighlightPlugin/offsetToPoint";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

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
	onError: error => {
		throw error;
	},
});

function renderEditor() {
	let capturedEditor: LexicalEditor | null = null;

	renderWithProviders(
		<LexicalExtensionComposer
			extension={TEST_EXTENSION}
			contentEditable={null}>
			<RichTextPlugin
				contentEditable={<ContentEditable aria-label="editor" />}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<EditorCapture
				onReady={editor => {
					capturedEditor = editor;
				}}
			/>
		</LexicalExtensionComposer>,
	);

	if (!capturedEditor) throw new Error("Editor was not captured");
	return capturedEditor as LexicalEditor;
}

function setContent(editor: LexicalEditor, build: () => void) {
	act(() => {
		editor.update(build, { discrete: true });
	});
}

describe("offsetToPoint", () => {
	it("Should map an offset at the start of a text node to offset 0", () => {
		// Arrange

		const editor = renderEditor();
		setContent(editor, () => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode("hello"));
			$getRoot().clear().append(paragraph);
		});

		// Act & Assert

		editor.getEditorState().read(() => {
			const { entries } = buildOffsetMap($getRoot());
			const actual = offsetToPoint(entries, 0);

			expect(actual?.offset).toBe(0);
			expect(actual?.node.getTextContent()).toBe("hello");
		});
	});

	it("Should map an offset spanning a node boundary to the correct node and local offset", () => {
		// Arrange

		const editor = renderEditor();
		setContent(editor, () => {
			const paragraph = $createParagraphNode();
			const second = $createTextNode("cd").toggleFormat("bold");
			// Adjacent plain-text nodes with matching formatting are merged by
			// Lexical's normalization, so the second node is bolded to keep it
			// a distinct node and create a real boundary to test against.
			paragraph.append($createTextNode("ab"), second);
			$getRoot().clear().append(paragraph);
		});

		// Act & Assert

		editor.getEditorState().read(() => {
			const { entries } = buildOffsetMap($getRoot());
			// Offset 3 is "d", the second character of the "cd" text node.
			const actual = offsetToPoint(entries, 3);

			expect(actual?.node.getTextContent()).toBe("cd");
			expect(actual?.offset).toBe(1);
		});
	});

	it("Should insert a separator between block-level siblings matching the backend's newline convention", () => {
		// Arrange

		const editor = renderEditor();
		setContent(editor, () => {
			const first = $createParagraphNode();
			first.append($createTextNode("First"));
			const second = $createParagraphNode();
			second.append($createTextNode("Second"));
			$getRoot().clear().append(first, second);
		});

		// Act & Assert

		editor.getEditorState().read(() => {
			const actual = buildOffsetMap($getRoot()).text;

			expect(actual).toBe("First\nSecond");
		});
	});
});
