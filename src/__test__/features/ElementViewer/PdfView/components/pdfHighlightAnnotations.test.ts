import {
	PdfAnnotationBorderStyle,
	PdfAnnotationSubtype,
	PdfBlendMode,
	PdfSquareAnnoObject,
} from "@embedpdf/models";
import {
	buildHighlightAnnotations,
	findFirstHighlightedElement,
	findHighlightsUnderSelection,
	flattenHighlightRects,
	isPdfHighlightAnnotation,
} from "../../../../../features/ElementViewer/PdfView/components/pdfHighlightAnnotations";

const RECT_1 = { origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } };
const RECT_2 = { origin: { x: 0, y: 0 }, size: { width: 2, height: 2 } };
const RECT_3 = { origin: { x: 9, y: 10 }, size: { width: 11, height: 12 } };

describe("buildHighlightAnnotations", () => {
	it("Should build one annotation per page, grouping that page's rects into segmentRects", () => {
		// Arrange

		const boundingRects = [
			{ page: 0, rect: RECT_1 },
			{ page: 0, rect: RECT_2 },
			{ page: 1, rect: RECT_3 },
		];

		// Act

		const annotations = buildHighlightAnnotations(
			boundingRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(annotations).toHaveLength(2);
		const [page0, page1] = annotations;
		expect(page0.pageIndex).toBe(0);
		expect(page0.segmentRects).toEqual([RECT_1, RECT_2]);
		expect(page1.pageIndex).toBe(1);
		expect(page1.segmentRects).toEqual([RECT_3]);
	});

	it("Should set the annotation type, color and blend mode for a text highlight", () => {
		// Arrange

		const boundingRects = [{ page: 0, rect: RECT_1 }];

		// Act

		const [annotation] = buildHighlightAnnotations(
			boundingRects,
			"element-1",
			"card",
			"#4DABF7",
		);

		// Assert

		expect(annotation.type).toBe(PdfAnnotationSubtype.HIGHLIGHT);
		expect(annotation.strokeColor).toBe("#4DABF7");
		expect(annotation.opacity).toBe(1);
		expect(annotation.blendMode).toBe(PdfBlendMode.Multiply);
	});

	it("Should mark the annotation read-only so it doesn't intercept clicks/selection", () => {
		// Arrange

		const boundingRects = [{ page: 0, rect: RECT_1 }];

		// Act

		const [annotation] = buildHighlightAnnotations(
			boundingRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(annotation.flags).toEqual(["print", "readOnly"]);
	});

	it("Should attach the element id and type via the custom field so it can be found later", () => {
		// Arrange

		const boundingRects = [
			{ page: 0, rect: RECT_1 },
			{ page: 1, rect: RECT_3 },
		];

		// Act

		const annotations = buildHighlightAnnotations(
			boundingRects,
			"element-42",
			"card",
			"#FFCD45",
		);

		// Assert

		expect(
			annotations.every(
				annotation =>
					annotation.custom.elementId === "element-42" &&
					annotation.custom.elementType === "card",
			),
		).toBe(true);
	});

	it("Should give each page's annotation its own unique id", () => {
		// Arrange

		const boundingRects = [
			{ page: 0, rect: RECT_1 },
			{ page: 1, rect: RECT_3 },
		];

		// Act

		const [first, second] = buildHighlightAnnotations(
			boundingRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(first.id).not.toBe(second.id);
	});

	it("Should compute the bounding rect as the union of a page's segment rects", () => {
		// Arrange

		const boundingRects = [
			{ page: 0, rect: RECT_1 },
			{ page: 0, rect: RECT_2 },
		];

		// Act

		const [annotation] = buildHighlightAnnotations(
			boundingRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(annotation.rect).toEqual({
			origin: { x: 0, y: 0 },
			size: { width: 4, height: 6 },
		});
	});

	it("Should return an empty array when there are no bounding rects", () => {
		// Act

		const annotations = buildHighlightAnnotations(
			[],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(annotations).toEqual([]);
	});
});

describe("flattenHighlightRects", () => {
	it("Should flatten each page's rect list into individual page/rect entries", () => {
		// Arrange

		const rectsByPage = { 0: [RECT_1, RECT_2], 1: [RECT_3] };

		// Act

		const flattened = flattenHighlightRects(rectsByPage);

		// Assert

		expect(flattened).toEqual([
			{ page: 0, rect: RECT_1 },
			{ page: 0, rect: RECT_2 },
			{ page: 1, rect: RECT_3 },
		]);
	});

	it("Should return an empty array when there are no pages", () => {
		// Act

		const flattened = flattenHighlightRects({});

		// Assert

		expect(flattened).toEqual([]);
	});
});

describe("isPdfHighlightAnnotation", () => {
	it("Should return true for a highlight annotation carrying an elementId", () => {
		// Arrange

		const [annotation] = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = isPdfHighlightAnnotation(annotation);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should return false for a non-highlight annotation", () => {
		// Arrange

		const squareAnnotation: PdfSquareAnnoObject = {
			id: "1",
			type: PdfAnnotationSubtype.SQUARE,
			pageIndex: 0,
			rect: RECT_1,
			flags: [],
			color: "#000000",
			opacity: 1,
			strokeWidth: 1,
			strokeColor: "#000000",
			strokeStyle: PdfAnnotationBorderStyle.SOLID,
		};

		// Act

		const actual = isPdfHighlightAnnotation(squareAnnotation);

		// Assert

		expect(actual).toBe(false);
	});
});

describe("findFirstHighlightedElement", () => {
	it("Should prefer a highlight on an earlier page over one on a later page", () => {
		// Arrange

		const first = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const second = buildHighlightAnnotations(
			[{ page: 1, rect: RECT_3 }],
			"element-2",
			"card",
			"#4DABF7",
		);
		const selectionRects = [
			{ page: 0, rect: RECT_1 },
			{ page: 1, rect: RECT_3 },
		];

		// Act

		const actual = findFirstHighlightedElement(
			[...first, ...second],
			selectionRects,
		);

		// Assert

		expect(actual).toEqual({
			elementId: "element-1",
			elementType: "extract",
		});
	});

	it("Should prefer the topmost-then-leftmost highlight regardless of selection rect order", () => {
		// Arrange — RECT_1 (y: 2) sits above RECT_3 (y: 10) on the same page,

		// but the selection rects list them in the opposite order (as a

		// bottom-to-top drag would produce).

		const topLeft = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const bottomRight = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_3 }],
			"element-2",
			"card",
			"#4DABF7",
		);
		const selectionRects = [
			{ page: 0, rect: RECT_3 },
			{ page: 0, rect: RECT_1 },
		];

		// Act

		const actual = findFirstHighlightedElement(
			[...bottomRight, ...topLeft],
			selectionRects,
		);

		// Assert

		expect(actual).toEqual({
			elementId: "element-1",
			elementType: "extract",
		});
	});

	it("Should skip highlights on a different page than the selection", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ page: 5, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const selectionRects = [{ page: 0, rect: RECT_1 }];

		// Act

		const actual = findFirstHighlightedElement(highlights, selectionRects);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should skip highlights that don't overlap the selection's rect", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_3 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const selectionRects = [{ page: 0, rect: RECT_1 }];

		// Act

		const actual = findFirstHighlightedElement(highlights, selectionRects);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when there are no selection rects", () => {
		// Act

		const actual = findFirstHighlightedElement([], []);

		// Assert

		expect(actual).toBeNull();
	});
});

describe("findHighlightsUnderSelection", () => {
	it("Should return the highlight overlapping the selection's rect on that page", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const selectionRects = [{ page: 0, rect: RECT_1 }];

		// Act

		const actual = findHighlightsUnderSelection(highlights, selectionRects);

		// Assert

		expect(actual).toEqual([{ pageIndex: 0, id: highlights[0].id }]);
	});

	it("Should not include a highlight on a different page of the same element", () => {
		// Arrange — one highlight spans two pages (a single extract crossing a

		// page boundary), but the selection only touches page 0.

		const highlights = buildHighlightAnnotations(
			[
				{ page: 0, rect: RECT_1 },
				{ page: 1, rect: RECT_3 },
			],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const selectionRects = [{ page: 0, rect: RECT_1 }];

		// Act

		const actual = findHighlightsUnderSelection(highlights, selectionRects);

		// Assert

		expect(actual).toEqual([{ pageIndex: 0, id: highlights[0].id }]);
	});

	it("Should not include a highlight belonging to a different element that the selection doesn't touch", () => {
		// Arrange

		const own = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const other = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_3 }],
			"element-2",
			"extract",
			"#FFCD45",
		);
		const selectionRects = [{ page: 0, rect: RECT_1 }];

		// Act

		const actual = findHighlightsUnderSelection(
			[...own, ...other],
			selectionRects,
		);

		// Assert

		expect(actual).toEqual([{ pageIndex: 0, id: own[0].id }]);
	});

	it("Should not return duplicate entries when multiple selection rects overlap the same highlight", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ page: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const selectionRects = [
			{ page: 0, rect: RECT_1 },
			{ page: 0, rect: RECT_1 },
		];

		// Act

		const actual = findHighlightsUnderSelection(highlights, selectionRects);

		// Assert

		expect(actual).toEqual([{ pageIndex: 0, id: highlights[0].id }]);
	});

	it("Should return an empty array when nothing overlaps", () => {
		// Act

		const actual = findHighlightsUnderSelection([], []);

		// Assert

		expect(actual).toEqual([]);
	});
});
