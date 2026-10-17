import {
	isBackwardSelection,
	selectionEndRect,
} from "../../../../components/Editor/plugins/selectionEndRect";

function rangeWith(rects: DOMRect[], caret = new DOMRect(0, 0, 0, 0)): Range {
	const collapse = vi.fn();
	return {
		collapsed: false,
		getClientRects: () => rects as unknown as DOMRectList,
		getBoundingClientRect: () => new DOMRect(0, 0, 0, 0),
		cloneRange: () => ({ collapse, getBoundingClientRect: () => caret }),
	} as unknown as Range;
}

// Three lines: the first two fragments share a line, so do the last two.
const LINES = [
	new DOMRect(100, 10, 50, 20),
	new DOMRect(150, 12, 30, 16),
	new DOMRect(0, 30, 300, 20),
	new DOMRect(0, 50, 80, 20),
	new DOMRect(80, 52, 40, 16),
];

function toTuple(rect: DOMRect) {
	return [rect.left, rect.top, rect.width, rect.height];
}

describe("selectionEndRect", () => {
	it("Should sit at the caret on the last line when the selection is forward", () => {
		// Arrange

		const range = rangeWith(LINES, new DOMRect(117, 51, 1, 18));

		// Act

		const actual = selectionEndRect(range, false);

		// Assert

		expect(toTuple(actual)).toEqual([117, 50, 0, 20]);
	});

	it("Should sit at the caret on the first line when the selection is backward", () => {
		// Arrange

		const range = rangeWith(LINES, new DOMRect(101, 11, 1, 18));

		// Act

		const actual = selectionEndRect(range, true);

		// Assert

		expect(toTuple(actual)).toEqual([101, 10, 0, 20]);
	});

	it("Should fall back to the end of the last line when the caret measures empty", () => {
		// Arrange

		const range = rangeWith(LINES);

		// Act

		const actual = selectionEndRect(range, false);

		// Assert

		expect(toTuple(actual)).toEqual([120, 50, 0, 20]);
	});

	it("Should fall back to the start of the first line when a backward caret measures empty", () => {
		// Arrange

		const range = rangeWith(LINES);

		// Act

		const actual = selectionEndRect(range, true);

		// Assert

		expect(toTuple(actual)).toEqual([100, 10, 0, 20]);
	});

	it("Should skip empty rects when the selection ends at a line break", () => {
		// Arrange

		const range = rangeWith([
			new DOMRect(0, 10, 120, 20),
			new DOMRect(300, 30, 0, 0),
		]);

		// Act

		const actual = selectionEndRect(range, false);

		// Assert

		expect(toTuple(actual)).toEqual([120, 10, 0, 20]);
	});
});

describe("isBackwardSelection", () => {
	it("Should be false when the anchor is the start of the range", () => {
		// Arrange

		const node = document.createTextNode("Hello");
		const range = {
			collapsed: false,
			startContainer: node,
			startOffset: 0,
		};
		const selection = { anchorNode: node, anchorOffset: 0 };

		// Act

		const actual = isBackwardSelection(
			selection as unknown as Selection,
			range as unknown as Range,
		);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should be true when the anchor is the end of the range", () => {
		// Arrange

		const node = document.createTextNode("Hello");
		const range = {
			collapsed: false,
			startContainer: node,
			startOffset: 0,
		};
		const selection = { anchorNode: node, anchorOffset: 5 };

		// Act

		const actual = isBackwardSelection(
			selection as unknown as Selection,
			range as unknown as Range,
		);

		// Assert

		expect(actual).toBe(true);
	});
});
