import {
	isBackwardPdfSelection,
	pdfMenuAnchor,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfMenuAnchor";

function rect(x: number, y: number, width: number, height = 10) {
	return { origin: { x, y }, size: { width, height } };
}

describe("pdfMenuAnchor", () => {
	it("Should anchor at the end of the last line when the drag went forwards", () => {
		// Arrange

		const lines = [rect(0, 0, 200), rect(0, 20, 100), rect(100, 21, 50, 8)];

		// Act

		const actual = pdfMenuAnchor(lines, false);

		// Assert

		expect(actual).toEqual({ offset: 0.75, align: "end" });
	});

	it("Should anchor at the start of the first line when the drag went backwards", () => {
		// Arrange

		const lines = [rect(50, 0, 150), rect(0, 20, 200)];

		// Act

		const actual = pdfMenuAnchor(lines, true);

		// Assert

		expect(actual).toEqual({ offset: 0.25, align: "start" });
	});

	it("Should centre on the anchor when it falls in the middle third", () => {
		// Arrange

		const lines = [rect(0, 0, 300), rect(0, 20, 150)];

		// Act

		const actual = pdfMenuAnchor(lines, false);

		// Assert

		expect(actual).toEqual({ offset: 0.5, align: "center" });
	});

	it("Should centre when there are no line rects", () => {
		// Act

		const actual = pdfMenuAnchor([], false);

		// Assert

		expect(actual).toEqual({ offset: 0.5, align: "center" });
	});
});

describe("isBackwardPdfSelection", () => {
	const RANGE = {
		start: { page: 0, index: 3 },
		end: { page: 1, index: 7 },
	};

	it("Should be false when the drag began at the selection's start", () => {
		// Act

		const actual = isBackwardPdfSelection({ page: 0, index: 3 }, RANGE);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should be true when the drag began at the selection's end", () => {
		// Act

		const actual = isBackwardPdfSelection({ page: 1, index: 7 }, RANGE);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should be null when the drag's start is unknown or matches neither end", () => {
		// Act

		const actual = [
			isBackwardPdfSelection(null, RANGE),
			isBackwardPdfSelection({ page: 0, index: 5 }, RANGE),
			isBackwardPdfSelection({ page: 0, index: 3 }, null),
		];

		// Assert

		expect(actual).toEqual([null, null, null]);
	});
});
