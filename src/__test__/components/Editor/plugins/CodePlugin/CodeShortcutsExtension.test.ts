import { buildEditorFromExtensions } from "@lexical/extension";
import { $isCodeNode } from "@lexical/code-core";
import { RichTextExtension } from "@lexical/rich-text";
import {
	$createParagraphNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	defineExtension,
	type LexicalEditor,
} from "lexical";
import { CodeShortcutsExtension } from "../../../../../components/Editor/plugins/CodePlugin/CodeShortcutsExtension";

function buildEditor(): LexicalEditor {
	const editor = buildEditorFromExtensions(
		defineExtension({
			name: "test",
			dependencies: [RichTextExtension, CodeShortcutsExtension],
			onError: error => {
				throw error;
			},
		}),
	);
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			$getRoot().clear().append(paragraph);
			paragraph.select();
		},
		{ discrete: true },
	);
	return editor;
}

// Each character is its own update, as typing is; the shortcuts then convert in a later update.
async function type(editor: LexicalEditor, text: string) {
	for (const character of text) {
		editor.update(
			() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection))
					selection.insertText(character);
			},
			{ discrete: true },
		);
	}
	await Promise.resolve();
}

describe("CodeShortcutsExtension", () => {
	it("Should format text as inline code when it is wrapped in backticks", async () => {
		// Arrange

		const editor = buildEditor();

		// Act

		await type(editor, "run `npm test`");

		// Assert

		const codeTexts = editor.getEditorState().read(() =>
			$getRoot()
				.getAllTextNodes()
				.filter(node => $isTextNode(node) && node.hasFormat("code"))
				.map(node => node.getTextContent()),
		);
		expect(codeTexts).toEqual(["npm test"]);
	});

	it("Should create a code block in the language when a fence with a language is typed", async () => {
		// Arrange

		const editor = buildEditor();

		// Act

		await type(editor, "```python ");

		// Assert

		const language = editor.getEditorState().read(() => {
			const code = $getRoot().getFirstChild();
			return $isCodeNode(code) ? code.getLanguage() : null;
		});
		expect(language).toBe("python");
	});
});
