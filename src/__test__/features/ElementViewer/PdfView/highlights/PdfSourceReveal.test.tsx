import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import PdfSourceReveal from "../../../../../features/ElementViewer/PdfView/highlights/PdfSourceReveal";
import {
	PdfCoreContext,
	PdfCoreValue,
} from "../../../../../features/ElementViewer/PdfView/core/pdfCoreContext";
import {
	PdfHighlightsContext,
	PdfHighlightsValue,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightsContext";
import { PdfHighlightAnnotation } from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightAnnotations";
import { spotNavigationState } from "../../../../../types/elements/spotNavigationState";

describe("PdfSourceReveal", () => {
	it("Should go to the highlight's page a frame after the layout is ready when it opens at a highlight", async () => {
		// Arrange

		const goToPage = vi.fn();
		const highlights = [
			{ pageIndex: 4, custom: { elementId: "card-1" } },
			{ pageIndex: 1, custom: { elementId: "other" } },
		] as PdfHighlightAnnotation[];
		render(
			<StrictMode>
				<MemoryRouter
					initialEntries={[
						{ pathname: "/", state: spotNavigationState("card-1") },
					]}>
					<PdfCoreContext
						value={
							{
								layoutReady: true,
								goToPage,
							} as unknown as PdfCoreValue
						}>
						<PdfHighlightsContext
							value={
								{ highlights } as unknown as PdfHighlightsValue
							}>
							<PdfSourceReveal />
						</PdfHighlightsContext>
					</PdfCoreContext>
				</MemoryRouter>
			</StrictMode>,
		);
		const calledBeforeFrame = goToPage.mock.calls.length;

		// Act

		await act(() => new Promise(requestAnimationFrame));

		// Assert

		expect(calledBeforeFrame).toBe(0);
		expect(goToPage).toHaveBeenCalledTimes(1);
		expect(goToPage).toHaveBeenCalledWith(5);
	});
});
