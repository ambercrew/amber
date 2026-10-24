import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReadingAnchors } from "../../../../../features/ElementViewer/LearningAssetView/core/useReadingAnchors";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "../../../../../features/ElementViewer/LearningAssetView/core/learningAssetViewConstants";

const VIEWPORT_BOTTOM_IN_PX = 768;
const ABOVE_VIEWPORT = { top: -200, bottom: -100 };
const IN_VIEWPORT = {
	top: LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX + 10,
	bottom: LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX + 100,
};

/** A stand-in editable root whose blocks sit at the given vertical spans. */
function makeRoot(spans: { top: number; bottom: number }[]): HTMLElement {
	const root = document.createElement("div");
	for (const span of spans) {
		const block = document.createElement("p");
		block.getBoundingClientRect = () => span as DOMRect;
		root.appendChild(block);
	}
	return root;
}

function renderAnchors(root: HTMLElement) {
	const scrollElement = document.createElement("div");
	scrollElement.getBoundingClientRect = () =>
		({ bottom: VIEWPORT_BOTTOM_IN_PX }) as DOMRect;
	return renderHook(() =>
		useReadingAnchors({
			primarySeq: 2,
			getContentRoot: seq => (seq === 2 ? root : undefined),
			scrollElement,
		}),
	);
}

describe("useReadingAnchors", () => {
	it("Should resolve to the right-clicked block when the menu is open", () => {
		// Arrange

		const { result } = renderAnchors(makeRoot([IN_VIEWPORT, IN_VIEWPORT]));
		act(() => {
			result.current.trackCursor(2, 0);
			result.current.setMenuAnchor({ split: 2, block: 1 });
		});

		// Act

		const anchor = result.current.resolveVisibleAnchor();

		// Assert

		expect(anchor).toEqual({ split: 2, block: 1 });
	});

	it("Should resolve to the caret when it is on screen", () => {
		// Arrange

		const { result } = renderAnchors(makeRoot([IN_VIEWPORT, IN_VIEWPORT]));
		act(() => {
			result.current.trackCursor(2, 1);
		});

		// Act

		const anchor = result.current.resolveVisibleAnchor();

		// Assert

		expect(anchor).toEqual({ split: 2, block: 1 });
	});

	it("Should resolve to the top visible block when the caret is scrolled off screen", () => {
		// Arrange

		const { result } = renderAnchors(
			makeRoot([ABOVE_VIEWPORT, IN_VIEWPORT, IN_VIEWPORT]),
		);
		act(() => {
			result.current.trackCursor(2, 0);
		});

		// Act

		const anchor = result.current.resolveVisibleAnchor();

		// Assert

		expect(anchor).toEqual({ split: 2, block: 1 });
	});
});
