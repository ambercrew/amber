import { buildEditorFromExtensions } from "@lexical/extension";
import {
	$createCodeHighlightNode,
	$createCodeNode,
	$isCodeHighlightNode,
	$isCodeNode,
	type CodeNode,
} from "@lexical/code-core";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	defineExtension,
	type LexicalEditor,
	type LexicalNode,
	type TextNode,
} from "lexical";
import {
	CodeHighlightExtension,
	stripCodeThemes,
} from "../../../../components/Editor/plugins/CodeHighlightPlugin/CodeHighlightExtension";
import {
	$createHighlightNode,
	$isHighlightNode,
	HighlightNode,
} from "../../../../components/Editor/plugins/HighlightPlugin/HighlightNode";
import {
	$createClozeHiddenNode,
	$isClozeHiddenNode,
	ClozeHiddenNode,
} from "../../../../components/Editor/plugins/ClozePlugin/ClozeHiddenNode";

function buildEditor(): LexicalEditor {
	return buildEditorFromExtensions(
		defineExtension({
			name: "test",
			nodes: [HighlightNode, ClozeHiddenNode],
			dependencies: [CodeHighlightExtension],
			onError: error => {
				throw error;
			},
		}),
	);
}

function $code(): CodeNode {
	const code = $getRoot().getFirstChild();
	if (!$isCodeNode(code)) throw new Error("No code block");
	return code;
}

// Shiki loads the theme and grammar asynchronously, then re-highlights.
async function waitForHighlighting(editor: LexicalEditor) {
	await vi.waitFor(() => {
		const tokenized = editor.getEditorState().read(() =>
			$code()
				.getAllTextNodes()
				.some(node => $isCodeHighlightNode(node) && node.getStyle()),
		);
		expect(tokenized).toBe(true);
	});
}

function highlightTexts(editor: LexicalEditor): string[] {
	return editor.getEditorState().read(() =>
		$code()
			.getChildren()
			.filter((node): node is HighlightNode => $isHighlightNode(node))
			.map(mark => mark.getTextContent()),
	);
}

interface SerializedCode {
	theme?: string;
	style?: string;
	children: { style?: string }[];
}

function lastTokenStyle(editor: LexicalEditor): string | undefined {
	return editor
		.getEditorState()
		.read(() => $code().getAllTextNodes().slice(-1)[0]?.getStyle());
}

function setCode(editor: LexicalEditor, $children: () => LexicalNode[]) {
	editor.update(
		() => {
			$getRoot()
				.clear()
				.append($createCodeNode("javascript").append(...$children()));
		},
		{ discrete: true },
	);
}

describe("CodeHighlightExtension", () => {
	it("Should keep a highlight mark when given a code block containing one", async () => {
		// Arrange

		const editor = buildEditor();

		// Act

		setCode(editor, () => [
			$createTextNode("const "),
			$createHighlightNode(["h1"], "yellow").append(
				$createTextNode("value"),
			),
			$createTextNode(" = 1;"),
		]);
		await waitForHighlighting(editor);

		// Assert

		expect(highlightTexts(editor)).toEqual(["value"]);
		expect(
			editor.getEditorState().read(() => $code().getTextContent()),
		).toBe("const value = 1;");
	});

	it("Should split tokens at the mark's edges when given a mark inside one token", async () => {
		// Arrange

		const editor = buildEditor();

		// Act

		setCode(editor, () => [
			$createTextNode("con"),
			$createHighlightNode(["h1"], "yellow").append(
				$createTextNode("st"),
			),
			$createTextNode(" x = 1;"),
		]);
		await waitForHighlighting(editor);

		// Assert

		expect(highlightTexts(editor)).toEqual(["st"]);
		const markChildren = editor.getEditorState().read(() =>
			$code()
				.getChildren()
				.filter($isHighlightNode)
				.flatMap(mark => mark.getChildren())
				.map(node => $isCodeHighlightNode(node)),
		);
		expect(markChildren).toEqual([true]);
	});

	it("Should keep a cloze's hidden node when given one in a code block", async () => {
		// Arrange

		const editor = buildEditor();

		// Act

		setCode(editor, () => [
			$createTextNode("let a = "),
			$createClozeHiddenNode("42"),
			$createTextNode(";"),
		]);
		await waitForHighlighting(editor);

		// Assert

		const clozes = editor.getEditorState().read(() =>
			$code()
				.getChildren()
				.filter($isClozeHiddenNode)
				.map(node => node.getHiddenText()),
		);
		expect(clozes).toEqual(["42"]);
	});

	it("Should keep the caret's position when given typing after a mark", async () => {
		// Arrange

		const editor = buildEditor();
		setCode(editor, () => [
			$createHighlightNode(["h1"], "yellow").append(
				$createTextNode("let"),
			),
			$createTextNode(" a"),
		]);
		await waitForHighlighting(editor);

		// Act

		editor.update(
			() => {
				$code().getLastDescendant()?.selectEnd();
				$getSelection()?.insertText("b");
			},
			{ discrete: true },
		);

		// Assert

		const caret = editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return null;
			const { anchor } = selection;
			return anchor.getNode().getTextContent().slice(0, anchor.offset);
		});
		expect(highlightTexts(editor)).toEqual(["let"]);
		expect(
			editor.getEditorState().read(() => $code().getTextContent()),
		).toBe("let ab");
		expect(caret?.endsWith("ab")).toBe(true);
	});

	it("Should turn tokens back into plain text when given a code block's tokens outside it", () => {
		// Arrange

		const editor = buildEditor();

		// Act

		editor.update(
			() => {
				$getRoot()
					.clear()
					.append(
						$createParagraphNode().append(
							$createCodeHighlightNode("x"),
						),
					);
			},
			{ discrete: true },
		);

		// Assert

		const tokens = editor
			.getEditorState()
			.read(() =>
				$getRoot().getAllTextNodes().filter($isCodeHighlightNode),
			);
		expect(tokens).toEqual([]);
	});

	it("Should re-highlight the block when given an edit inside a cloze", async () => {
		// Arrange

		const editor = buildEditor();
		setCode(editor, () => [
			$createTextNode("a = "),
			$createClozeHiddenNode("42", "1"),
			$createTextNode("; b"),
		]);
		await waitForHighlighting(editor);
		const before = lastTokenStyle(editor);

		// Act

		editor.update(
			() => {
				$code()
					.getChildren()
					.find($isClozeHiddenNode)
					?.setTextContent('"');
			},
			{ discrete: true },
		);

		// Assert

		await vi.waitFor(() => expect(lastTokenStyle(editor)).not.toBe(before));
	});

	it("Should type into the code rather than the cloze when given a caret on a replaced token right after one", async () => {
		// Arrange

		const editor = buildEditor();
		setCode(editor, () => [
			$createClozeHiddenNode("42"),
			$createTextNode("x"),
		]);
		await waitForHighlighting(editor);
		editor.update(
			() => {
				// A stale style makes the token get replaced while the caret is on its start.
				$code()
					.getAllTextNodes()
					.find(node => node.getTextContent() === "x")
					?.setStyle("color: red")
					.select(0, 0);
			},
			{ discrete: true },
		);

		// Act

		editor.update(() => $getSelection()?.insertText("a"), {
			discrete: true,
		});

		// Assert

		const clozes = editor.getEditorState().read(() =>
			$code()
				.getChildren()
				.filter($isClozeHiddenNode)
				.map((node: TextNode) => node.getTextContent()),
		);
		expect(clozes).toEqual(["[...]"]);
		expect(
			editor.getEditorState().read(() => $code().getTextContent()),
		).toBe("[...]ax");
	});

	it("Should drop the theme and token colors when given a highlighted block to serialize", async () => {
		// Arrange

		const editor = buildEditor();
		setCode(editor, () => [$createTextNode("const x = 1;")]);
		await waitForHighlighting(editor);

		// Act

		const json = JSON.stringify(
			editor.getEditorState().toJSON(),
			stripCodeThemes,
		);

		// Assert

		const { root } = JSON.parse(json) as {
			root: { children: SerializedCode[] };
		};
		const [code] = root.children;
		expect(code.theme).toBeUndefined();
		const styles = [code, ...code.children].map(node => node.style ?? "");
		expect(styles.every(style => style === "")).toBe(true);
	});
});
