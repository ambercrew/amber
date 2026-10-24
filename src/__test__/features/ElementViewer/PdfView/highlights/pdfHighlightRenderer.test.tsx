import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { AnnotationRendererProps } from "@embedpdf/plugin-annotation/react";
import { pdfHighlightRenderer } from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightRenderer";

function renderHighlight(custom?: { elementId: string; elementType: string }) {
	const rect = { origin: { x: 10, y: 20 }, size: { width: 100, height: 12 } };
	const currentObject = {
		id: "a1",
		type: PdfAnnotationSubtype.HIGHLIGHT,
		pageIndex: 0,
		rect,
		segmentRects: [rect],
		strokeColor: "#123456",
		opacity: 0.5,
		custom,
	};
	const props = {
		currentObject,
		scale: 2,
		pageIndex: 0,
		documentId: "doc-1",
		isSelected: false,
		isEditing: false,
		appearanceActive: false,
	} as unknown as AnnotationRendererProps;
	const { container } = render(pdfHighlightRenderer.render(props));
	return container.firstElementChild as HTMLElement;
}

describe("pdfHighlightRenderer", () => {
	it("Should draw an extract highlight in the editor's yellow when it belongs to an extract", () => {
		// Arrange

		const custom = { elementId: "e1", elementType: "extract" };

		// Act

		const segment = renderHighlight(custom);

		// Assert

		expect(segment.style.background).toContain("--mantine-color-yellow-4");
	});

	it("Should draw a cloze highlight in the editor's blue when it belongs to a card", () => {
		// Arrange

		const custom = { elementId: "c1", elementType: "card" };

		// Act

		const segment = renderHighlight(custom);

		// Assert

		expect(segment.style.background).toContain("--mantine-color-blue-4");
	});

	it("Should keep the stored color when the highlight is the PDF's own", () => {
		// Arrange

		const custom = undefined;

		// Act

		const segment = renderHighlight(custom);

		// Assert

		expect(segment.style.opacity).toBe("0.5");
		expect(segment.style.background).not.toContain("--mantine-color");
	});

	it("Should scale the segment from page coordinates when the page is zoomed", () => {
		// Arrange

		const custom = { elementId: "e1", elementType: "extract" };

		// Act

		const segment = renderHighlight(custom);

		// Assert

		expect(segment.style.width).toBe("200px");
		expect(segment.style.height).toBe("24px");
	});
});
