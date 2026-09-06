import { PdfAnnotationSubtype, PdfBlendMode } from "@embedpdf/models";
import {
	buildHighlightAnnotations,
	flattenHighlightRects,
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
			"#FFCD45",
		);

		// Assert

		expect(annotation.flags).toEqual(["print", "readOnly"]);
	});

	it("Should attach the element id via the custom field so it can be found later", () => {
		// Arrange

		const boundingRects = [
			{ page: 0, rect: RECT_1 },
			{ page: 1, rect: RECT_3 },
		];

		// Act

		const annotations = buildHighlightAnnotations(
			boundingRects,
			"element-42",
			"#FFCD45",
		);

		// Assert

		expect(
			annotations.every(
				annotation => annotation.custom.elementId === "element-42",
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
