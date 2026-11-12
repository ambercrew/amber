import {
	buildHighlightAnnotations,
	findFirstHighlightedElement,
	findHighlightsUnderSelection,
	isPdfHighlightAnnotation,
	parseStoredHighlights,
	serializeHighlights,
	toPageRect,
	toStoredRect,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightAnnotations";

const RECT_1 = { x: 1, y: 2, width: 3, height: 4 };
const RECT_2 = { x: 0, y: 0, width: 2, height: 2 };
const RECT_3 = { x: 9, y: 10, width: 11, height: 12 };

describe("buildHighlightAnnotations", () => {
	it("Should build one annotation per page, grouping that page's rects into segmentRects", () => {
		// Arrange

		const lineRects = [
			{ pageIndex: 0, rect: RECT_1 },
			{ pageIndex: 0, rect: RECT_2 },
			{ pageIndex: 1, rect: RECT_3 },
		];

		// Act

		const annotations = buildHighlightAnnotations(
			lineRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(annotations).toHaveLength(2);
		const [page0, page1] = annotations;
		expect(page0.pageIndex).toBe(0);
		expect(page0.segmentRects).toEqual([
			toStoredRect(RECT_1),
			toStoredRect(RECT_2),
		]);
		expect(page1.pageIndex).toBe(1);
		expect(page1.segmentRects).toEqual([toStoredRect(RECT_3)]);
	});

	it("Should store rects in embedpdf 2's origin and size shape when building a highlight", () => {
		// Arrange

		const lineRects = [{ pageIndex: 0, rect: RECT_1 }];

		// Act

		const [annotation] = buildHighlightAnnotations(
			lineRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(annotation.segmentRects).toEqual([
			{ origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } },
		]);
	});

	it("Should keep embedpdf 2's highlight type, color, blend mode and flags when building a highlight", () => {
		// Arrange

		const lineRects = [{ pageIndex: 0, rect: RECT_1 }];

		// Act

		const [annotation] = buildHighlightAnnotations(
			lineRects,
			"element-1",
			"card",
			"#4DABF7",
		);

		// Assert

		expect(annotation.type).toBe(9);
		expect(annotation.strokeColor).toBe("#4DABF7");
		expect(annotation.blendMode).toBe(1);
		expect(annotation.flags).toEqual(["print", "readOnly"]);
	});

	it("Should attach the element id and type via the custom field so it can be found later", () => {
		// Arrange

		const lineRects = [{ pageIndex: 0, rect: RECT_1 }];

		// Act

		const [annotation] = buildHighlightAnnotations(
			lineRects,
			"element-42",
			"card",
			"#4DABF7",
		);

		// Assert

		expect(annotation.custom).toEqual({
			elementId: "element-42",
			elementType: "card",
		});
	});

	it("Should give each page's annotation its own unique id", () => {
		// Arrange

		const lineRects = [
			{ pageIndex: 0, rect: RECT_1 },
			{ pageIndex: 1, rect: RECT_3 },
		];

		// Act

		const [page0, page1] = buildHighlightAnnotations(
			lineRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(page0.id).not.toBe(page1.id);
	});

	it("Should compute the bounding rect as the union of a page's segment rects", () => {
		// Arrange

		const lineRects = [
			{ pageIndex: 0, rect: RECT_1 },
			{ pageIndex: 0, rect: RECT_2 },
		];

		// Act

		const [annotation] = buildHighlightAnnotations(
			lineRects,
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Assert

		expect(toPageRect(annotation.rect)).toEqual({
			x: 0,
			y: 0,
			width: 4,
			height: 6,
		});
	});

	it("Should return an empty array when there are no line rects", () => {
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

describe("isPdfHighlightAnnotation", () => {
	it("Should return true for a highlight carrying an elementId", () => {
		// Arrange

		const [annotation] = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = isPdfHighlightAnnotation(annotation);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should return false for an annotation of another type", () => {
		// Arrange

		const square = {
			type: 5,
			pageIndex: 0,
			segmentRects: [],
			custom: { elementId: "element-1", elementType: "extract" },
		};

		// Act

		const actual = isPdfHighlightAnnotation(square);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should return false for a highlight without an element", () => {
		// Arrange

		const pdfOwnHighlight = { type: 9, pageIndex: 0, segmentRects: [] };

		// Act

		const actual = isPdfHighlightAnnotation(pdfOwnHighlight);

		// Assert

		expect(actual).toBe(false);
	});
});

describe("parseStoredHighlights", () => {
	it("Should read back what serializeHighlights wrote", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[
				{ pageIndex: 0, rect: RECT_1 },
				{ pageIndex: 2, rect: RECT_3 },
			],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = parseStoredHighlights(serializeHighlights(highlights));

		// Assert

		expect(actual).toEqual(highlights);
	});

	it("Should read highlights saved by embedpdf 2's annotation plugin", () => {
		// Arrange

		const savedByV2 = JSON.stringify([
			{
				annotation: {
					id: "highlight-1",
					type: 9,
					pageIndex: 3,
					rect: {
						origin: { x: 1, y: 2 },
						size: { width: 3, height: 4 },
					},
					segmentRects: [
						{
							origin: { x: 1, y: 2 },
							size: { width: 3, height: 4 },
						},
					],
					strokeColor: "#FFCD45",
					opacity: 1,
					blendMode: 1,
					flags: ["print", "readOnly"],
					custom: { elementId: "element-1", elementType: "extract" },
					created: "2026-01-01T00:00:00.000Z",
				},
			},
		]);

		// Act

		const [actual] = parseStoredHighlights(savedByV2);

		// Assert

		expect(actual.id).toBe("highlight-1");
		expect(actual.pageIndex).toBe(3);
		expect(actual.custom.elementId).toBe("element-1");
	});

	it("Should skip items that aren't our highlights", () => {
		// Arrange

		const json = JSON.stringify([
			{ annotation: { type: 2, pageIndex: 0 } },
			{ unrelated: true },
			null,
		]);

		// Act

		const actual = parseStoredHighlights(json);

		// Assert

		expect(actual).toEqual([]);
	});

	it("Should return no highlights when the JSON isn't a list", () => {
		// Act

		const actual = parseStoredHighlights("{}");

		// Assert

		expect(actual).toEqual([]);
	});
});

describe("serializeHighlights", () => {
	it("Should wrap each highlight in embedpdf 2's transfer item so older builds can read it", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = JSON.parse(serializeHighlights(highlights)) as unknown;

		// Assert

		expect(actual).toEqual([{ annotation: highlights[0] }]);
	});
});

describe("findFirstHighlightedElement", () => {
	it("Should prefer a highlight on an earlier page over one on a later page", () => {
		// Arrange

		const first = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);
		const second = buildHighlightAnnotations(
			[{ pageIndex: 1, rect: RECT_3 }],
			"element-2",
			"card",
			"#4DABF7",
		);
		const selectionRects = [
			{ pageIndex: 1, rect: RECT_3 },
			{ pageIndex: 0, rect: RECT_1 },
		];

		// Act

		const actual = findFirstHighlightedElement(
			[...second, ...first],
			selectionRects,
		);

		// Assert

		expect(actual).toEqual({
			elementId: "element-1",
			elementType: "extract",
		});
	});

	it("Should prefer the topmost-then-leftmost highlight regardless of selection rect order", () => {
		// Arrange

		const lower = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_3 }],
			"element-lower",
			"card",
			"#4DABF7",
		);
		const upper = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_1 }],
			"element-upper",
			"extract",
			"#FFCD45",
		);
		const selectionRects = [
			{ pageIndex: 0, rect: RECT_3 },
			{ pageIndex: 0, rect: RECT_1 },
		];

		// Act

		const actual = findFirstHighlightedElement(
			[...lower, ...upper],
			selectionRects,
		);

		// Assert

		expect(actual?.elementId).toBe("element-upper");
	});

	it("Should skip highlights on a different page than the selection", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ pageIndex: 1, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = findFirstHighlightedElement(highlights, [
			{ pageIndex: 0, rect: RECT_1 },
		]);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should skip highlights that don't overlap the selection's rect", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_3 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = findFirstHighlightedElement(highlights, [
			{ pageIndex: 0, rect: RECT_2 },
		]);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when there are no selection rects", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = findFirstHighlightedElement(highlights, []);

		// Assert

		expect(actual).toBeNull();
	});
});

describe("findHighlightsUnderSelection", () => {
	it("Should return the highlight overlapping the selection's rect on that page", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = findHighlightsUnderSelection(highlights, [
			{ pageIndex: 0, rect: RECT_1 },
		]);

		// Assert

		expect(actual).toEqual([highlights[0].id]);
	});

	it("Should not include a highlight on a different page of the same element", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[
				{ pageIndex: 0, rect: RECT_1 },
				{ pageIndex: 1, rect: RECT_1 },
			],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = findHighlightsUnderSelection(highlights, [
			{ pageIndex: 0, rect: RECT_1 },
		]);

		// Assert

		expect(actual).toEqual([highlights[0].id]);
	});

	it("Should not return duplicate ids when multiple selection rects overlap the same highlight", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_1 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = findHighlightsUnderSelection(highlights, [
			{ pageIndex: 0, rect: RECT_1 },
			{ pageIndex: 0, rect: { x: 2, y: 3, width: 1, height: 1 } },
		]);

		// Assert

		expect(actual).toEqual([highlights[0].id]);
	});

	it("Should return an empty array when nothing overlaps", () => {
		// Arrange

		const highlights = buildHighlightAnnotations(
			[{ pageIndex: 0, rect: RECT_3 }],
			"element-1",
			"extract",
			"#FFCD45",
		);

		// Act

		const actual = findHighlightsUnderSelection(highlights, [
			{ pageIndex: 0, rect: RECT_2 },
		]);

		// Assert

		expect(actual).toEqual([]);
	});
});
