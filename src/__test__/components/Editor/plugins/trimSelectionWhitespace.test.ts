import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	createEditor,
	type TextNode,
} from "lexical";
import { $trimSelectionWhitespace } from "../../../../components/Editor/plugins/HighlightPlugin/trimSelectionWhitespace";

function selectAndTrim(
	paragraphs: string[],
	[anchorNode, anchorOffset]: [number, number],
	[focusNode, focusOffset]: [number, number],
) {
	const editor = createEditor({
		onError: error => {
			throw error;
		},
	});
	let result = "";
	editor.update(
		() => {
			const textNodes: TextNode[] = paragraphs.map(text => {
				const textNode = $createTextNode(text);
				$getRoot().append($createParagraphNode().append(textNode));
				return textNode;
			});
			const selection = $createRangeSelection();
			selection.setTextNodeRange(
				textNodes[anchorNode],
				anchorOffset,
				textNodes[focusNode],
				focusOffset,
			);

			$trimSelectionWhitespace(selection);

			result = selection.getTextContent();
		},
		{ discrete: true },
	);
	return result;
}

describe("$trimSelectionWhitespace", () => {
	it("Should start and end on non-whitespace when the selection has surrounding spaces", () => {
		// Arrange

		const paragraphs = ["one   two   three"];

		// Act

		const actual = selectAndTrim(paragraphs, [0, 3], [0, 12]);

		// Assert

		expect(actual).toBe("two");
	});

	it("Should trim the same way when the selection is backward", () => {
		// Arrange

		const paragraphs = ["one   two   three"];

		// Act

		const actual = selectAndTrim(paragraphs, [0, 12], [0, 3]);

		// Assert

		expect(actual).toBe("two");
	});

	it("Should skip into the next paragraph when the selection starts at the end of the previous one", () => {
		// Arrange

		const paragraphs = ["first ", "  second  "];

		// Act

		const actual = selectAndTrim(paragraphs, [0, 5], [1, 10]);

		// Assert

		expect(actual).toBe("second");
	});
});
