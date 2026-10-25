import { useEffect } from "react";
import { act, fireEvent } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
	$createParagraphNode,
	$getRoot,
	$createNodeSelection,
	$getSelection,
	$isNodeSelection,
	$setSelection,
	LexicalEditor,
} from "lexical";
import {
	$createEquationNode,
	$isEquationNode,
	EquationNode,
} from "../../../../components/Editor/plugins/EquationPlugin/EquationNode";
import { EquationEditingPlugin } from "../../../../components/Editor/plugins/EquationPlugin/EquationEditingPlugin";
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

function renderEditor() {
	let capturedEditor: LexicalEditor | null = null;

	renderWithProviders(
		<LexicalComposer
			initialConfig={{
				namespace: "test",
				nodes: [EquationNode],
				onError: error => {
					throw error;
				},
			}}>
			<RichTextPlugin
				contentEditable={<ContentEditable aria-label="editor" />}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<EquationEditingPlugin />
			<EditorCapture
				onReady={editor => {
					capturedEditor = editor;
				}}
			/>
		</LexicalComposer>,
	);

	if (!capturedEditor) throw new Error("Editor was not captured");
	return capturedEditor as LexicalEditor;
}

async function insertEquations(editor: LexicalEditor, ...equations: string[]) {
	const nodeKeys: string[] = [];
	await flush(() => {
		editor.update(() => {
			const paragraph = $createParagraphNode();
			for (const equation of equations) {
				const node = $createEquationNode(equation);
				paragraph.append(node);
				nodeKeys.push(node.getKey());
			}
			$getRoot().clear().append(paragraph);
		});
	});
	return nodeKeys;
}

async function insertEquation(editor: LexicalEditor, equation: string) {
	const [nodeKey] = await insertEquations(editor, equation);
	return nodeKey;
}

async function selectNodes(editor: LexicalEditor, nodeKeys: string[]) {
	await flush(() => {
		editor.update(() => {
			const selection = $createNodeSelection();
			for (const nodeKey of nodeKeys) selection.add(nodeKey);
			$setSelection(selection);
		});
	});
}

/** Runs `fn` inside `act` and flushes Lexical's pending update microtask. */
async function flush(fn: () => void) {
	await act(async () => {
		fn();
		await Promise.resolve();
	});
}

function readEquation(editor: LexicalEditor, nodeKey: string) {
	return editor.getEditorState().read(() => {
		const node = editor.getEditorState()._nodeMap.get(nodeKey);
		return $isEquationNode(node) ? node.getEquation() : null;
	});
}

function countParagraphs(editor: LexicalEditor) {
	return editor.getEditorState().read(() => $getRoot().getChildren().length);
}

function selectedKeys(editor: LexicalEditor) {
	return editor.getEditorState().read(() => {
		const selection = $getSelection();
		return $isNodeSelection(selection)
			? selection.getNodes().map(node => node.getKey())
			: null;
	});
}

function getEquationOutline(index = 0) {
	const spans = document.querySelectorAll<HTMLElement>(
		"[data-lexical-decorator] span",
	);
	return spans[index]?.style.outline ?? null;
}

function getTextarea() {
	// Autosize keeps a hidden measurement textarea mounted in the document.
	return document.querySelector('textarea:not([aria-hidden="true"])');
}

describe("EquationEditingPlugin", () => {
	it("Should commit the value and close the editor when Enter is pressed", async () => {
		// Arrange

		const editor = renderEditor();
		const nodeKey = await insertEquation(editor, "x");
		await flush(() => {
			fireEvent.doubleClick(
				document.querySelector("[data-lexical-decorator] span")!,
			);
		});
		const textarea = getTextarea()!;

		// Act

		await flush(() => {
			fireEvent.change(textarea, { target: { value: "y^2" } });
		});
		await flush(() => {
			fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
		});

		// Assert

		expect(readEquation(editor, nodeKey)).toBe("y^2");
		expect(getTextarea()).toBeNull();
		expect(countParagraphs(editor)).toBe(1);
		expect(selectedKeys(editor)).toEqual([nodeKey]);
		expect(document.activeElement).toBe(
			document.querySelector("[contenteditable]"),
		);
	});

	it("Should start editing when Enter is pressed while the equation is selected", async () => {
		// Arrange

		const editor = renderEditor();
		const nodeKey = await insertEquation(editor, "x");

		await selectNodes(editor, [nodeKey]);

		// Act

		await flush(() => {
			fireEvent.keyDown(document.querySelector("[contenteditable]")!, {
				key: "Enter",
				code: "Enter",
			});
		});

		// Assert

		expect(getTextarea()).not.toBeNull();
	});

	it("Should not start editing when Enter is pressed while more than the equation is selected", async () => {
		// Arrange

		const editor = renderEditor();
		const nodeKeys = await insertEquations(editor, "x", "y");
		await selectNodes(editor, nodeKeys);

		// Act

		await flush(() => {
			fireEvent.keyDown(document.querySelector("[contenteditable]")!, {
				key: "Enter",
				code: "Enter",
			});
		});

		// Assert

		expect(getTextarea()).toBeNull();
		expect(getEquationOutline()).toBe("");
	});

	it("Should outline the equation when it is the whole selection", async () => {
		// Arrange

		const editor = renderEditor();
		const nodeKey = await insertEquation(editor, "x");

		// Act

		await selectNodes(editor, [nodeKey]);

		// Assert

		expect(getEquationOutline()).not.toBe("");
	});

	it("Should discard the draft and refocus the editor when Escape is pressed", async () => {
		// Arrange

		const editor = renderEditor();
		const nodeKey = await insertEquation(editor, "x");
		await flush(() => {
			fireEvent.doubleClick(
				document.querySelector("[data-lexical-decorator] span")!,
			);
		});
		const textarea = getTextarea()!;
		await flush(() => {
			fireEvent.change(textarea, { target: { value: "y^2" } });
		});

		// Act

		await flush(() => {
			fireEvent.keyDown(textarea, { key: "Escape", code: "Escape" });
		});

		// Assert

		expect(readEquation(editor, nodeKey)).toBe("x");
		expect(getTextarea()).toBeNull();
		expect(selectedKeys(editor)).toEqual([nodeKey]);
		expect(document.activeElement).toBe(
			document.querySelector("[contenteditable]"),
		);
	});

	it("Should redraw the equation in place when an edit is committed", async () => {
		// Arrange

		const editor = renderEditor();
		await insertEquation(editor, "x");
		const content = document.querySelector<HTMLElement>(
			"[data-lexical-decorator] span",
		)!;
		const before = content.innerHTML;
		await flush(() => {
			fireEvent.doubleClick(content);
		});

		// Act

		await flush(() => {
			fireEvent.change(getTextarea()!, { target: { value: "y" } });
		});
		await flush(() => {
			fireEvent.keyDown(getTextarea()!, { key: "Enter", code: "Enter" });
		});

		// Assert

		expect(content.innerHTML).not.toBe(before);
		expect(content.style.display).toBe("");
	});

	it("Should remove the equation when an empty edit is committed", async () => {
		// Arrange

		const editor = renderEditor();
		const nodeKey = await insertEquation(editor, "x");
		await flush(() => {
			fireEvent.doubleClick(
				document.querySelector("[data-lexical-decorator] span")!,
			);
		});

		// Act

		await flush(() => {
			fireEvent.change(getTextarea()!, { target: { value: "  " } });
		});
		await flush(() => {
			fireEvent.keyDown(getTextarea()!, { key: "Enter", code: "Enter" });
		});

		// Assert

		expect(readEquation(editor, nodeKey)).toBeNull();
		expect(getTextarea()).toBeNull();
	});

	it("Should not commit the draft when the field blurs after Escape", async () => {
		// Arrange

		const editor = renderEditor();
		const nodeKey = await insertEquation(editor, "x");
		await flush(() => {
			fireEvent.doubleClick(
				document.querySelector("[data-lexical-decorator] span")!,
			);
		});
		const textarea = getTextarea()!;
		await flush(() => {
			fireEvent.change(textarea, { target: { value: "y^2" } });
		});

		// Act

		await flush(() => {
			fireEvent.keyDown(textarea, { key: "Escape", code: "Escape" });
			fireEvent.blur(textarea);
		});

		// Assert

		expect(readEquation(editor, nodeKey)).toBe("x");
	});
});
