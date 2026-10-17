import { createRef } from "react";
import { fireEvent, screen } from "@testing-library/react";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	createEditor,
	LexicalEditor,
} from "lexical";
import ExtractAiCardsButton from "../../../features/ElementViewer/ExtractAiCardsButton";
import { renderWithProviders } from "../../test-utils/renderWithProviders";
import SettingsDto from "../../../api/settings/dto/settingsDto";
import { CONVERT_EXTRACT_TO_CARDS_PROMPT } from "../../../features/Ai/aiPrompts";

function editorWithText(text: string) {
	const editor = createEditor();
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode(text));
			$getRoot().append(paragraph);
		},
		{ discrete: true },
	);
	return editor;
}

function renderButton(editor: LexicalEditor | null, aiEnabled = true) {
	const editorRef = createRef<LexicalEditor | null>();
	editorRef.current = editor;
	return renderWithProviders(<ExtractAiCardsButton editorRef={editorRef} />, {
		preloadedState: {
			settings: { settings: { enableAi: aiEnabled } as SettingsDto },
		},
	});
}

describe("ExtractAiCardsButton", () => {
	it("Should attach the extract's text and ask the AI for cards and to finish it when clicked", () => {
		// Arrange

		const { store } = renderButton(editorWithText("  Extract text  "));

		// Act

		fireEvent.click(
			screen.getByRole("button", { name: "Make Cards with AI" }),
		);

		// Assert

		expect(store.getState().ai.snippets).toEqual([
			expect.objectContaining({ text: "Extract text" }),
		]);
		expect(store.getState().ai.pendingPrompt).toBe(
			CONVERT_EXTRACT_TO_CARDS_PROMPT,
		);
	});

	it("Should not ask the AI anything when the extract is empty", () => {
		// Arrange

		const { store } = renderButton(editorWithText("   "));

		// Act

		fireEvent.click(
			screen.getByRole("button", { name: "Make Cards with AI" }),
		);

		// Assert

		expect(store.getState().ai.snippets).toEqual([]);
		expect(store.getState().ai.pendingPrompt).toBeNull();
	});

	it("Should not render when AI is disabled", () => {
		// Arrange & Act

		renderButton(editorWithText("Extract text"), false);

		// Assert

		expect(
			screen.queryByRole("button", { name: "Make Cards with AI" }),
		).toBeNull();
	});
});
