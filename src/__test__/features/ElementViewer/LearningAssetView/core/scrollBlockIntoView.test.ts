import { beforeEach, describe, expect, it, vi } from "vitest";
import { scrollBlockIntoView } from "../../../../../features/ElementViewer/LearningAssetView/core/scrollBlockIntoView";
import { safeAreaTopInPx } from "../../../../../utils/safeArea";

vi.mock(import("../../../../../utils/safeArea"));

const HEADER_IN_PX = 56;

/** A root whose block `i` sits `tops[i]` px below the scroller's top. */
function makeRoot(tops: number[]): HTMLElement {
	const root = document.createElement("div");
	for (const top of tops) {
		const block = document.createElement("p");
		block.getBoundingClientRect = () => ({ top }) as DOMRect;
		root.appendChild(block);
	}
	return root;
}

function makeScrollElement() {
	const scrollElement = document.createElement("div");
	scrollElement.style.scrollPaddingTop = `${HEADER_IN_PX}px`;
	scrollElement.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
	const scrollTo = vi.fn();
	scrollElement.scrollTo = scrollTo;
	const hidden = vi.fn();
	scrollElement.addEventListener("headroom:hide", hidden);
	return { scrollElement, scrollTo, hidden };
}

describe("scrollBlockIntoView", () => {
	beforeEach(() => {
		vi.mocked(safeAreaTopInPx).mockReturnValue(0);
	});

	it("Should land the block flush with the top and hide the header when it's past the header's fixed zone", () => {
		// Arrange

		const { scrollElement, scrollTo, hidden } = makeScrollElement();
		const root = makeRoot([0, 800]);

		// Act

		scrollBlockIntoView(root, 1, scrollElement);

		// Assert

		expect(scrollTo).toHaveBeenCalledWith({
			top: 800,
			behavior: "instant",
		});
		expect(hidden).toHaveBeenCalledTimes(1);
	});

	it("Should land the block just below the status bar when the header is hidden on a phone", () => {
		// Arrange

		vi.mocked(safeAreaTopInPx).mockReturnValue(24);
		const { scrollElement, scrollTo } = makeScrollElement();
		const root = makeRoot([0, 800]);

		// Act

		scrollBlockIntoView(root, 1, scrollElement);

		// Assert

		expect(scrollTo).toHaveBeenCalledWith({
			top: 800 - 24,
			behavior: "instant",
		});
	});

	it("Should land the block below the header and keep it shown when it's within the header's fixed zone", () => {
		// Arrange

		const { scrollElement, scrollTo, hidden } = makeScrollElement();
		const root = makeRoot([0, 100]);

		// Act

		scrollBlockIntoView(root, 1, scrollElement);

		// Assert

		expect(scrollTo).toHaveBeenCalledWith({
			top: 100 - HEADER_IN_PX,
			behavior: "instant",
		});
		expect(hidden).not.toHaveBeenCalled();
	});

	it("Should land on the last block when the block is out of range", () => {
		// Arrange

		const { scrollElement } = makeScrollElement();
		const root = makeRoot([0, 800]);

		// Act

		const actual = scrollBlockIntoView(root, 9, scrollElement);

		// Assert

		expect(actual).toBe(root.children[1]);
	});
});
