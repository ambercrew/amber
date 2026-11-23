import { useEffect } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createCodeNode, $isCodeNode } from "@lexical/code-core";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	type LexicalEditor,
} from "lexical";
import Editor from "../../../../../components/Editor/Editor";
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

async function renderEditor(language = "javascript") {
	let captured: LexicalEditor | null = null;
	renderWithProviders(
		<Editor>
			<EditorCapture
				onReady={editor => {
					captured = editor;
				}}
			/>
		</Editor>,
	);
	const editor = captured as unknown as LexicalEditor;
	await act(async () => {
		screen.getByLabelText("Rich text editor").focus();
		editor.update(
			() => {
				const code = $createCodeNode(language);
				code.append($createTextNode("const a = 1;"));
				$getRoot().clear().append(code, $createParagraphNode());
				code.selectEnd();
			},
			{ discrete: true },
		);
	});
	return editor;
}

function codeLanguage(editor: LexicalEditor) {
	return editor.getEditorState().read(() => {
		const code = $getRoot().getFirstChild();
		return $isCodeNode(code) ? code.getLanguage() : null;
	});
}

describe("CodeLanguagePlugin", () => {
	it("Should show the block's language when the caret is in a code block", async () => {
		// Arrange & Act

		await renderEditor();

		// Assert

		expect(
			await screen.findByRole("combobox", { name: "Code language" }),
		).toHaveValue("JavaScript");
	});

	it("Should show plain text when the block's language is a plain text alias", async () => {
		// Arrange & Act

		await renderEditor("txt");

		// Assert

		expect(
			await screen.findByRole("combobox", { name: "Code language" }),
		).toHaveValue("Plain text");
	});

	it("Should show the block's language when it isn't a known one", async () => {
		// Arrange & Act

		await renderEditor("foo");

		// Assert

		expect(
			await screen.findByRole("combobox", { name: "Code language" }),
		).toHaveValue("foo");
	});

	it("Should change the block's language when another one is picked", async () => {
		// Arrange

		const user = userEvent.setup();
		const editor = await renderEditor();

		// Act

		await user.click(
			await screen.findByRole("combobox", { name: "Code language" }),
		);
		await user.click(await screen.findByRole("option", { name: "Python" }));

		// Assert

		expect(codeLanguage(editor)).toBe("python");
	});

	it("Should select the language's text when the picker is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		await renderEditor();
		const picker = await screen.findByRole("combobox", {
			name: "Code language",
		});

		// Act

		await user.click(picker);

		// Assert

		await waitFor(() => {
			expect(picker).toHaveProperty("selectionStart", 0);
			expect(picker).toHaveProperty("selectionEnd", "JavaScript".length);
		});
	});

	it("Should hide the picker when the caret leaves the code block", async () => {
		// Arrange

		const editor = await renderEditor();
		await screen.findByRole("combobox", { name: "Code language" });

		// Act

		await act(async () => {
			editor.update(() => $getRoot().getLastChildOrThrow().selectEnd(), {
				discrete: true,
			});
		});

		// Assert

		expect(
			screen.queryByRole("combobox", { name: "Code language" }),
		).not.toBeInTheDocument();
	});
});
