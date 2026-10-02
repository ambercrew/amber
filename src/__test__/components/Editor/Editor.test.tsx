import { useEffect } from "react";
import { act, screen } from "@testing-library/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	type LexicalEditor,
	PASTE_TAG,
	type TextNode,
	type UpdateTag,
} from "lexical";
import { $createCodeNode } from "@lexical/code-core";
import { $isEquationNode } from "../../../components/Editor/plugins/EquationPlugin/EquationNode";
import Editor from "../../../components/Editor/Editor";
import { setupStore } from "../../../stores/store";
import { renderWithProviders } from "../../test-utils/renderWithProviders";
import { useIsCoarsePointer } from "../../../hooks/useIsCoarsePointer";

vi.mock(import("../../../hooks/useIsCoarsePointer"), () => ({
	useIsCoarsePointer: vi.fn().mockReturnValue(true),
}));

function renderEditor(virtualKeyboardSuppressed: boolean) {
	renderWithProviders(<Editor />, {
		preloadedState: {
			app: {
				...setupStore().getState().app,
				virtualKeyboardSuppressed,
			},
		},
	});
	return screen.getByLabelText("Rich text editor");
}

function EditorCapture({
	onReady,
}: {
	onReady: (editor: LexicalEditor) => void;
}) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => onReady(editor), [editor, onReady]);
	return null;
}

describe("Editor", () => {
	beforeEach(() => {
		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
	});

	it("Should not ask for the on-screen keyboard when it is suppressed", () => {
		// Arrange & Act

		const contentEditable = renderEditor(true);

		// Assert

		expect(contentEditable).toHaveAttribute("inputmode", "none");
	});

	it("Should leave the on-screen keyboard alone when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		const contentEditable = renderEditor(true);

		// Assert

		expect(contentEditable).not.toHaveAttribute("inputmode");
	});

	it("Should leave the on-screen keyboard alone when it is not suppressed", () => {
		// Arrange & Act

		const contentEditable = renderEditor(false);

		// Assert

		expect(contentEditable).not.toHaveAttribute("inputmode");
	});

	it("Should turn $…$ into an equation node when given typed text", async () => {
		// Arrange

		const editor = renderCapturedEditor();

		// Act

		await setParagraph(
			editor,
			() => $createTextNode("Area is $\\pi r^2$ here"),
			{ caret: "start" },
		);

		// Assert

		expect(equationsIn(editor)).toEqual(["\\pi r^2"]);
	});

	it("Should wait for the next character when the caret is right after a closing $", async () => {
		// Arrange

		const editor = renderCapturedEditor();

		// Act

		await setParagraph(editor, () => $createTextNode("costs $5-$"), {
			caret: "end",
		});

		// Assert

		expect(equationsIn(editor)).toEqual([]);
	});

	it("Should turn a trailing $…$ into an equation node when the caret moves on", async () => {
		// Arrange

		const editor = renderCapturedEditor();
		await setParagraph(editor, () => $createTextNode("area $x^2$"), {
			caret: "end",
		});

		// Act

		await act(async () => {
			editor.update(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.insertParagraph();
			});
		});

		// Assert

		expect(equationsIn(editor)).toEqual(["x^2"]);
	});

	it("Should leave $…$ as text when given code-formatted text", async () => {
		// Arrange

		const editor = renderCapturedEditor();

		// Act

		await setParagraph(
			editor,
			() => $createTextNode("echo $PATH:$HOME").toggleFormat("code"),
			{ caret: "start" },
		);

		// Assert

		expect(equationsIn(editor)).toEqual([]);
	});

	it("Should leave $…$ as text when given text typed in a code block", async () => {
		// Arrange

		const editor = renderCapturedEditor();

		// Act

		await act(async () => {
			editor.update(() => {
				const text = $createTextNode("echo $PATH:$HOME");
				$getRoot().clear().append($createCodeNode().append(text));
				text.select(0, 0);
			});
		});

		// Assert

		expect(
			editor.getEditorState().read(() => $getRoot().getTextContent()),
		).toBe("echo $PATH:$HOME");
	});

	it("Should leave $…$ as text when given stored text the caret is not in", async () => {
		// Arrange

		const editor = renderCapturedEditor();

		// Act

		await setParagraph(editor, () => $createTextNode("Price $x$ here"));

		// Assert

		expect(equationsIn(editor)).toEqual([]);
	});

	it("Should turn every delimiter into an equation node when given pasted text", async () => {
		// Arrange

		const editor = renderCapturedEditor();

		// Act

		await setParagraph(
			editor,
			() => $createTextNode("$a$ and \\(b\\) and $$c$$ and \\[d\\]"),
			{ tag: PASTE_TAG },
		);

		// Assert

		expect(equationsIn(editor)).toEqual(["a", "b", "c", "d"]);
	});

	it("Should leave $…$ as text when given pasted price ranges", async () => {
		// Arrange

		const editor = renderCapturedEditor();

		// Act

		await setParagraph(
			editor,
			() => $createTextNode("costs $5-$10 total, $x$$y$"),
			{ tag: PASTE_TAG },
		);

		// Assert

		expect(equationsIn(editor)).toEqual([]);
	});
});

function renderCapturedEditor(): LexicalEditor {
	let editor: LexicalEditor | null = null;
	renderWithProviders(
		<Editor>
			<EditorCapture
				onReady={captured => {
					editor = captured;
				}}
			/>
		</Editor>,
	);
	const captured = editor as LexicalEditor | null;
	if (!captured) throw new Error("Editor was not captured");
	return captured;
}

async function setParagraph(
	editor: LexicalEditor,
	$createText: () => TextNode,
	{ caret, tag }: { caret?: "start" | "end"; tag?: UpdateTag } = {},
) {
	await act(async () => {
		editor.update(
			() => {
				const text = $createText();
				$getRoot().clear().append($createParagraphNode().append(text));
				if (caret === "start") text.select(0, 0);
				if (caret === "end") text.selectEnd();
			},
			{ tag },
		);
	});
}

function equationsIn(editor: LexicalEditor): string[] {
	return editor.getEditorState().read(() =>
		$getRoot()
			.getChildren()
			.flatMap(paragraph =>
				$isElementNode(paragraph) ? paragraph.getChildren() : [],
			)
			.filter($isEquationNode)
			.map(node => node.getEquation()),
	);
}
