import { render, screen } from "@testing-library/react";
import PdfHighlightLayer from "../../../../../features/ElementViewer/PdfView/highlights/PdfHighlightLayer";
import { buildHighlightAnnotations } from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightAnnotations";
import {
	groupHighlightsByPage,
	PdfHighlightsContext,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightsContext";

const SCALE = 2;

vi.mock("@embedpdf/react/runtime", () => ({
	// Page 1 at 2 px per point, as the Stage's page context would give it.
	usePage: () => ({
		pageIndex: 1,
		transform: {
			toPixels: ({ x, y }: { x: number; y: number }) => ({
				x: x * SCALE,
				y: y * SCALE,
			}),
		},
	}),
}));

function renderLayer(
	elementType: "extract" | "card",
	pageIndex = 1,
	rect = { x: 5, y: 10, width: 20, height: 4 },
) {
	const highlights = buildHighlightAnnotations(
		[{ pageIndex, rect }],
		"element-1",
		elementType,
		"#FFCD45",
	);
	render(
		<PdfHighlightsContext
			value={{
				highlights,
				highlightsByPage: groupHighlightsByPage(highlights),
				addHighlights: vi.fn(),
				removeHighlights: vi.fn(),
			}}>
			<PdfHighlightLayer />
		</PdfHighlightsContext>,
	);
}

describe("PdfHighlightLayer", () => {
	it("Should draw an extract highlight in the editor's yellow when it belongs to an extract", () => {
		// Act

		renderLayer("extract");

		// Assert

		expect(
			screen.getByTestId("pdf-highlight-segment").style.background,
		).toContain("--mantine-color-yellow-4");
	});

	it("Should draw a cloze highlight in the editor's blue when it belongs to a card", () => {
		// Act

		renderLayer("card");

		// Assert

		expect(
			screen.getByTestId("pdf-highlight-segment").style.background,
		).toContain("--mantine-color-blue-4");
	});

	it("Should scale the segment from page points when the page is zoomed", () => {
		// Act

		renderLayer("extract");

		// Assert

		expect(screen.getByTestId("pdf-highlight-segment")).toHaveStyle({
			left: "10px",
			top: "20px",
			width: "40px",
			height: "8px",
		});
	});

	it("Should draw nothing when the highlights are on other pages", () => {
		// Act

		renderLayer("extract", 0);

		// Assert

		expect(screen.queryByTestId("pdf-highlight-segment")).toBeNull();
	});
});
