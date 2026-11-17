import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { landOnViewPosition } from "../../../../../features/ElementViewer/LearningAssetView/core/viewPosition";
import { useReadingAnchors } from "../../../../../features/ElementViewer/LearningAssetView/core/useReadingAnchors";
import { safeAreaTopInPx } from "../../../../../utils/safeArea";

vi.mock(import("../../../../../utils/safeArea"));

const BLOCK_HEIGHT_IN_PX = 100;

/** A root of `count` stacked blocks, laid out as if the scroller sat at `scrollTop()`. */
function makeRoot(count: number, scrollTop: () => number): HTMLElement {
	const root = document.createElement("div");
	for (let i = 0; i < count; i++) {
		const block = document.createElement("p");
		block.getBoundingClientRect = () => {
			const top = i * BLOCK_HEIGHT_IN_PX - scrollTop();
			return { top, bottom: top + BLOCK_HEIGHT_IN_PX } as DOMRect;
		};
		root.appendChild(block);
	}
	return root;
}

function makeScrollElement(scrollTop: number) {
	const scrollElement = document.createElement("div");
	scrollElement.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
	scrollElement.scrollTop = scrollTop;
	const scrollTo = vi.fn();
	scrollElement.scrollTo = scrollTo;
	return { scrollElement, scrollTo };
}

describe("viewPosition", () => {
	beforeEach(() => {
		vi.mocked(safeAreaTopInPx).mockReturnValue(0);
	});

	it("Should find the block at the viewport top and how far past it the scroll sits when measured", () => {
		// Arrange

		const { scrollElement } = makeScrollElement(1250);
		const root = makeRoot(20, () => scrollElement.scrollTop);
		const { result } = renderHook(() =>
			useReadingAnchors({
				primarySeq: 4,
				getContentRoot: () => root,
				scrollElement,
			}),
		);

		// Act

		const actual = result.current.topVisible();

		// Assert

		expect(actual).toEqual({ split: 4, block: 12, offset: 50 });
	});

	it("Should scroll back to the same position relative to its block when landing", () => {
		// Arrange

		const { scrollElement, scrollTo } = makeScrollElement(0);
		const root = makeRoot(20, () => scrollElement.scrollTop);

		// Act

		landOnViewPosition({ split: 4, block: 12, offset: 50 })(
			root,
			scrollElement,
		);

		// Assert

		expect(scrollTo).toHaveBeenCalledWith({
			top: 1250,
			behavior: "instant",
		});
	});
});
