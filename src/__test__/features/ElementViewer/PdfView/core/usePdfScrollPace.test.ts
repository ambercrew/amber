import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfScrollPace } from "../../../../../features/ElementViewer/PdfView/core/usePdfScrollPace";
import { SCROLL_SETTLE_IN_MILLISECONDS } from "../../../../../features/ElementViewer/scrollPace";

const { useViewportCapabilityMock } = vi.hoisted(() => ({
	useViewportCapabilityMock: vi.fn(),
}));

vi.mock("@embedpdf/plugin-viewport/react", () => ({
	useViewportCapability: useViewportCapabilityMock,
}));

const VIEWPORT_HEIGHT_IN_PX = 800;

const DOCUMENT_ID = "doc-1";

describe("usePdfScrollPace", () => {
	let scrollTo: (scrollTop: number) => void;

	beforeEach(() => {
		vi.useFakeTimers();
		useViewportCapabilityMock.mockReturnValue({
			provides: {
				forDocument: () => ({
					getMetrics: () => ({ clientHeight: VIEWPORT_HEIGHT_IN_PX }),
					onScrollChange: (
						listener: (metrics: { scrollTop: number }) => void,
					) => {
						scrollTo = scrollTop => listener({ scrollTop });
						return () => {};
					},
				}),
			},
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("Should not be flying when scrolling less than a viewport", () => {
		// Arrange

		const { result } = renderHook(() => usePdfScrollPace(DOCUMENT_ID));

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

		const { result } = renderHook(() => usePdfScrollPace(DOCUMENT_ID));

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

		const { result } = renderHook(() => usePdfScrollPace(DOCUMENT_ID));
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
