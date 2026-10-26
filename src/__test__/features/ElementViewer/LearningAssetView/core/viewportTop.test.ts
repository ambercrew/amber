import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "../../../../../features/ElementViewer/LearningAssetView/core/learningAssetViewConstants";
import { viewportTop } from "../../../../../features/ElementViewer/LearningAssetView/core/viewportTop";
import { safeAreaTopInPx } from "../../../../../utils/safeArea";

vi.mock(import("../../../../../utils/safeArea"));

function makeScrollElement(
	top: number,
	scrollPaddingTop: string,
	scrollTop = 0,
) {
	const scrollElement = document.createElement("div");
	scrollElement.scrollTop = scrollTop;
	scrollElement.style.scrollPaddingTop = scrollPaddingTop;
	scrollElement.getBoundingClientRect = () => ({ top }) as DOMRect;
	return scrollElement;
}

describe("viewportTop", () => {
	beforeEach(() => {
		vi.mocked(safeAreaTopInPx).mockReturnValue(0);
	});

	it("Should be below the scroller's scroll padding when the header is taller than usual", () => {
		// Arrange

		const scrollElement = makeScrollElement(0, "100px");

		// Act

		const actual = viewportTop(scrollElement);

		// Assert

		expect(actual).toBe(100);
	});

	it("Should add the scroller's own offset when it doesn't start at the window's top", () => {
		// Arrange

		const scrollElement = makeScrollElement(20, "56px");

		// Act

		const actual = viewportTop(scrollElement);

		// Assert

		expect(actual).toBe(76);
	});

	it("Should be the scroller's own top when scrolled past the header's fixed zone, where the header is hidden", () => {
		// Arrange

		const scrollElement = makeScrollElement(0, "56px", 1000);

		// Act

		const actual = viewportTop(scrollElement);

		// Assert

		expect(actual).toBe(0);
	});

	it("Should be below the status bar when the header is hidden on a phone", () => {
		// Arrange

		vi.mocked(safeAreaTopInPx).mockReturnValue(24);
		const scrollElement = makeScrollElement(0, "56px", 1000);

		// Act

		const actual = viewportTop(scrollElement);

		// Assert

		expect(actual).toBe(24);
	});

	it("Should fall back to the default header height when there is no scroller", () => {
		// Act

		const actual = viewportTop(null);

		// Assert

		expect(actual).toBe(LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX);
	});
});
