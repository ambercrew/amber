import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SCROLL_START_TIMEOUT_MS,
	usePdfNavigator,
} from "../../../../../features/ElementViewer/PdfView/core/usePdfNavigator";

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

interface PageChangeStateEvent {
	documentId: string;
	state: { isChanging: boolean; targetPage: number };
}

const DOCUMENT_ID = "doc-1";

/** A stand-in for `ScrollCapability` and `ViewportCapability` whose page change completes when the test says so. */
function createFakeCapabilities() {
	const handlers = new Set<(event: PageChangeStateEvent) => void>();
	const view = { visiblePages: [1], isScrolling: false };
	const scrollToPage = vi.fn();
	const scroll = {
		forDocument: vi.fn(() => ({
			getMetrics: () => ({ visiblePages: view.visiblePages }),
			scrollToPage,
		})),
		onPageChangeState: (handler: (event: PageChangeStateEvent) => void) => {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},
		completePageChange: (targetPage: number, documentId = DOCUMENT_ID) =>
			handlers.forEach(handler =>
				handler({
					documentId,
					state: { isChanging: false, targetPage },
				}),
			),
	};
	const viewport = {
		forDocument: vi.fn(() => ({ isScrolling: () => view.isScrolling })),
	};
	return { scroll, viewport, view, scrollToPage };
}

describe("usePdfNavigator", () => {
	let fake: ReturnType<typeof createFakeCapabilities>;

	beforeEach(() => {
		vi.useFakeTimers();
		fake = createFakeCapabilities();
		useScrollCapabilityMock.mockReturnValue({ provides: fake.scroll });
		useViewportCapabilityMock.mockReturnValue({ provides: fake.viewport });
	});

	afterEach(() => {
		vi.useRealTimers();
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

	it("Should request the header to hide when jumping", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));

		// Act

		act(() => result.current.goToPage(5));

		// Assert

		expect(result.current.hideRequests).toBe(1);
	});

	it("Should not flash the page when the smooth jump is still scrolling there", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		fake.view.isScrolling = true;

		// Act

		act(() => result.current.goToPage(5, { flashColor: "red" }));
		act(() => {
			vi.advanceTimersByTime(SCROLL_START_TIMEOUT_MS);
		});

		// Assert

		expect(result.current.flash).toBeNull();
	});

	it("Should flash the page when the smooth jump completes with the page in view", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		act(() => result.current.goToPage(5, { flashColor: "red" }));
		fake.view.visiblePages = [4, 5];

		// Act

		act(() => fake.scroll.completePageChange(5));

		// Assert

		expect(result.current.flash).toEqual({ pageNumber: 5, color: "red" });
	});

	it("Should not flash the page when the reader scrolled away before the jump completed", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		act(() => result.current.goToPage(40, { flashColor: "red" }));
		fake.view.visiblePages = [2, 3];

		// Act

		act(() => fake.scroll.completePageChange(40));

		// Assert

		expect(result.current.flash).toBeNull();
	});

	it("Should flash the page when the smooth jump never starts scrolling", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		fake.view.visiblePages = [9, 10];
		act(() => result.current.goToPage(10, { flashColor: "red" }));

		// Act

		act(() => {
			vi.advanceTimersByTime(SCROLL_START_TIMEOUT_MS);
		});

		// Assert

		expect(result.current.flash).toEqual({ pageNumber: 10, color: "red" });
	});

	it("Should not flash an older jump's page when a newer jump replaced it", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		act(() => result.current.goToPage(5, { flashColor: "red" }));
		act(() => result.current.goToPage(8, { flashColor: "blue" }));
		fake.view.visiblePages = [5];

		// Act

		act(() => fake.scroll.completePageChange(5));

		// Assert

		expect(result.current.flash).toBeNull();
	});

	it("Should drop the pending flash when a page change completes for another page", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		act(() => result.current.goToPage(5, { flashColor: "red" }));
		act(() => fake.scroll.completePageChange(9));
		fake.view.visiblePages = [5];

		// Act

		act(() => fake.scroll.completePageChange(5));

		// Assert

		expect(result.current.flash).toBeNull();
	});

	it("Should flash right away when the jump is instant", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		fake.view.visiblePages = [1];

		// Act

		act(() =>
			result.current.goToPage(7, {
				behavior: "instant",
				flashColor: "red",
			}),
		);

		// Assert

		expect(result.current.flash).toEqual({ pageNumber: 7, color: "red" });
	});

	it("Should ignore a completed page change when it is for a different document", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		fake.view.isScrolling = true;
		act(() => result.current.goToPage(5, { flashColor: "red" }));
		fake.view.visiblePages = [5];

		// Act

		act(() => fake.scroll.completePageChange(5, "other-doc"));

		// Assert

		expect(result.current.flash).toBeNull();
	});

	it("Should clear the flash when it has been played", () => {
		// Arrange

		const { result } = renderHook(() => usePdfNavigator(DOCUMENT_ID));
		act(() =>
			result.current.goToPage(1, {
				behavior: "instant",
				flashColor: "red",
			}),
		);

		// Act

		act(() => result.current.clearFlash());

		// Assert

		expect(result.current.flash).toBeNull();
	});
});
