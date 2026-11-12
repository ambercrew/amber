import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StageHostCapability } from "@embedpdf/plugin-stage/contract/host";
import { usePdfScrollPaceTracker } from "../../../../../features/ElementViewer/PdfView/core/usePdfScrollPaceTracker";
import { SCROLL_SETTLE_IN_MILLISECONDS } from "../../../../../features/ElementViewer/scrollPace";

const VIEWPORT_HEIGHT_IN_PX = 800;

describe("usePdfScrollPaceTracker", () => {
	let stage: StageHostCapability;
	let scrollTo: (scrollTop: number) => void;

	beforeEach(() => {
		vi.useFakeTimers();
		let scrollTop = 0;
		let onCamera: () => void = () => {};
		// The Stage moves a camera; its host reports the scroll position that makes.
		stage = {
			getScrollMetrics: () => ({
				scrollTop,
				scrollHeight: VIEWPORT_HEIGHT_IN_PX * 10,
				clientHeight: VIEWPORT_HEIGHT_IN_PX,
			}),
			onCameraChanged: (listener: () => void) => {
				onCamera = listener;
				return () => {};
			},
		} as unknown as StageHostCapability;
		scrollTo = top => {
			scrollTop = top;
			onCamera();
		};
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("Should not be flying when scrolling less than a viewport", () => {
		// Arrange

		const { result } = renderHook(() => usePdfScrollPaceTracker(stage));

		// Act

		act(() => {
			scrollTo(0);
			scrollTo(VIEWPORT_HEIGHT_IN_PX / 2);
		});

		// Assert

		expect(result.current.flying).toBe(false);
	});

	it("Should be flying when scrolling more than a viewport at once", () => {
		// Arrange

		const { result } = renderHook(() => usePdfScrollPaceTracker(stage));

		// Act

		act(() => {
			scrollTo(0);
			scrollTo(VIEWPORT_HEIGHT_IN_PX * 3);
		});

		// Assert

		expect(result.current.flying).toBe(true);
	});

	it("Should settle when the fast scroll stops", () => {
		// Arrange

		const { result } = renderHook(() => usePdfScrollPaceTracker(stage));
		act(() => {
			scrollTo(0);
			scrollTo(VIEWPORT_HEIGHT_IN_PX * 3);
		});

		// Act

		act(() => {
			vi.advanceTimersByTime(SCROLL_SETTLE_IN_MILLISECONDS);
		});

		// Assert

		expect(result.current.flying).toBe(false);
	});
});
