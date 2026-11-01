import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfNavigator } from "../../../../../features/ElementViewer/PdfView/core/usePdfNavigator";
import { safeAreaTopInPx } from "../../../../../utils/safeArea";

const { useScrollCapabilityMock, useViewportCapabilityMock } = vi.hoisted(
	() => ({
		useScrollCapabilityMock: vi.fn(),
		useViewportCapabilityMock: vi.fn(),
	}),
);

vi.mock("@embedpdf/plugin-scroll/react", () => ({
	useScrollCapability: useScrollCapabilityMock,
}));

vi.mock("@embedpdf/plugin-viewport/react", () => ({
	useViewportCapability: useViewportCapabilityMock,
}));

vi.mock(import("../../../../../utils/safeArea"));

const VIEWPORT_HEIGHT_IN_PX = 800;

const DOCUMENT_ID = "doc-1";

/** A stand-in for `ScrollCapability` that records the jumps asked of it. */
function createFakeCapabilities() {
	const scrollToPage = vi.fn();
	const scroll = { forDocument: vi.fn(() => ({ scrollToPage })) };
	return { scroll, scrollToPage };
}

describe("usePdfNavigator", () => {
	let fake: ReturnType<typeof createFakeCapabilities>;

	beforeEach(() => {
		fake = createFakeCapabilities();
		useScrollCapabilityMock.mockReturnValue({ provides: fake.scroll });
		useViewportCapabilityMock.mockReturnValue({
			provides: {
				forDocument: () => ({
					getMetrics: () => ({ clientHeight: VIEWPORT_HEIGHT_IN_PX }),
				}),
			},
		});
		vi.mocked(safeAreaTopInPx).mockReturnValue(0);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Should scroll smoothly to the page when no behavior is given", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));

		// Act

		act(() => result.current.goToPage(5));

		// Assert

		expect(fake.scrollToPage).toHaveBeenCalledWith({
			pageNumber: 5,
			behavior: "smooth",
		});
	});

	it("Should pass the point to bring into view when page coordinates are given", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));

		// Act

		act(() =>
			result.current.goToPage(5, {
				pageCoordinates: { x: 10, y: 20 },
				alignY: 30,
			}),
		);

		// Assert

		expect(fake.scrollToPage).toHaveBeenCalledWith({
			pageNumber: 5,
			behavior: "smooth",
			pageCoordinates: { x: 10, y: 20 },
			alignY: 30,
		});
	});

	it("Should land the page's top below the status bar when on a phone", () => {
		// Arrange

		vi.mocked(safeAreaTopInPx).mockReturnValue(40);
		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));

		// Act

		act(() => result.current.goToPage(5));

		// Assert

		expect(fake.scrollToPage).toHaveBeenCalledWith({
			pageNumber: 5,
			behavior: "smooth",
			alignY: (40 / VIEWPORT_HEIGHT_IN_PX) * 100,
		});
	});

	it("Should keep the given alignment when on a phone", () => {
		// Arrange

		vi.mocked(safeAreaTopInPx).mockReturnValue(40);
		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));

		// Act

		act(() => result.current.goToPage(5, { alignY: 30 }));

		// Assert

		expect(fake.scrollToPage).toHaveBeenCalledWith({
			pageNumber: 5,
			behavior: "smooth",
			alignY: 30,
		});
	});

	it("Should request the header to hide when jumping", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));

		// Act

		act(() => result.current.goToPage(5));

		// Assert

		expect(result.current.hideRequests).toBe(1);
	});
});
