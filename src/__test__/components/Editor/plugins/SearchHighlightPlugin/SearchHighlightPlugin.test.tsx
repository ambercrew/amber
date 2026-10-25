import { act } from "@testing-library/react";
import { createDOMRange } from "@lexical/selection";
import { describe, expect, it, vi } from "vitest";
import Editor from "../../../../../components/Editor/Editor";
import SearchHighlightPlugin from "../../../../../components/Editor/plugins/SearchHighlightPlugin/SearchHighlightPlugin";
import { searchHighlightRegistry } from "../../../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("@lexical/selection"), async importOriginal => ({
	...(await importOriginal()),
	createDOMRange: vi.fn(),
}));

const CONTENT = JSON.stringify({
	root: {
		type: "root",
		version: 1,
		direction: null,
		format: "",
		indent: 0,
		children: [
			{
				type: "paragraph",
				version: 1,
				direction: null,
				format: "",
				indent: 0,
				textFormat: 0,
				textStyle: "",
				children: [
					{
						type: "text",
						version: 1,
						text: "a cat and a cat",
						format: 0,
						style: "",
						mode: "normal",
						detail: 0,
					},
				],
			},
		],
	},
});

describe("SearchHighlightPlugin", () => {
	it("Should report every match in the text when its ranges can't be placed in the DOM yet", async () => {
		// Arrange

		vi.mocked(createDOMRange).mockReturnValue(null);
		const onMatches = vi.fn();

		// Act

		renderWithProviders(
			<Editor initialContent={CONTENT}>
				<SearchHighlightPlugin
					editorKey="split"
					query="cat"
					caseSensitive={false}
					currentMatchLocalIndex={null}
					onMatches={onMatches}
				/>
			</Editor>,
		);
		await act(async () => {});

		// Assert

		expect(onMatches).toHaveBeenLastCalledWith("split", 2);
	});

	it("Should highlight the current match's own range when an earlier match has no DOM range", async () => {
		// Arrange

		const secondRange = document.createRange();
		vi.mocked(createDOMRange)
			.mockReset()
			.mockReturnValueOnce(null)
			.mockReturnValue(secondRange);

		// Act

		renderWithProviders(
			<Editor initialContent={CONTENT}>
				<SearchHighlightPlugin
					editorKey="split"
					query="cat"
					caseSensitive={false}
					currentMatchLocalIndex={1}
					onMatches={vi.fn()}
				/>
			</Editor>,
		);
		await act(async () => {});

		// Assert

		expect(searchHighlightRegistry.getCurrentRange()).toBe(secondRange);
		expect(searchHighlightRegistry.getRanges("split")).toEqual([
			null,
			secondRange,
		]);
	});
});
