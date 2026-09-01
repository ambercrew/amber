import { act, renderHook } from "@testing-library/react";
import { useElementHeadroom } from "../../hooks/useElementHeadroom";

describe("useElementHeadroom", () => {
	let element: HTMLElement;

	beforeEach(() => {
		element = document.createElement("div");
	});

	/** Moves the scroller to `scrollTop` and lets the hook observe it. */
	function scrollTo(scrollTop: number) {
		element.scrollTop = scrollTop;
		act(() => {
			element.dispatchEvent(new Event("scroll"));
		});
	}

	function render(fixedAt = 100, scrollDistance = 100) {
		return renderHook(() =>
			useElementHeadroom({ element, fixedAt, scrollDistance }),
		);
	}

	it("Should stay fully pinned when there is no scroller", () => {
		// Arrange, Act

		const { result } = renderHook(() =>
			useElementHeadroom({ element: null, fixedAt: 100 }),
		);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 1 });
	});

	it("Should stay fully pinned when the scroller is within the fixed zone", () => {
		// Arrange

		const { result } = render();

		// Act

		scrollTo(100);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 1 });
	});

	it("Should partially hide when scrolled down less than the scroll distance past the fixed zone", () => {
		// Arrange

		const { result } = render();

		// Act

		scrollTo(140);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 0.6 });
	});

	it("Should fully hide when scrolled down a full scroll distance past the fixed zone", () => {
		// Arrange

		const { result } = render();

		// Act

		scrollTo(200);

		// Assert

		expect(result.current).toEqual({ pinned: false, scrollProgress: 0 });
	});

	it("Should not hide before the scroll distance is exceeded when a longer distance is given", () => {
		// Arrange

		const { result } = render(100, 400);

		// Act

		scrollTo(300);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 0.5 });
	});

	it("Should reveal again from where it stopped when the direction changes", () => {
		// Arrange

		const { result } = render();
		scrollTo(170);

		// Act

		scrollTo(150);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 0.5 });
	});

	it("Should be fully revealed when scrolled up a full scroll distance", () => {
		// Arrange

		const { result } = render();
		scrollTo(400);

		// Act

		scrollTo(390);
		scrollTo(280);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 1 });
	});

	it("Should be fully pinned again when scrolled back into the fixed zone", () => {
		// Arrange

		const { result } = render();
		scrollTo(400);

		// Act

		scrollTo(50);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 1 });
	});

	it("Should ignore scrolling when the window is being resized", () => {
		// Arrange

		const { result } = render();

		// Act

		act(() => {
			window.dispatchEvent(new Event("resize"));
		});
		scrollTo(400);

		// Assert

		expect(result.current).toEqual({ pinned: true, scrollProgress: 1 });
	});

	it("Should observe scrolling again when the resize settled", () => {
		// Arrange

		vi.useFakeTimers();
		const { result } = render();
		act(() => {
			window.dispatchEvent(new Event("resize"));
		});

		// Act

		act(() => {
			vi.advanceTimersByTime(300);
		});
		scrollTo(400);

		// Assert

		expect(result.current).toEqual({ pinned: false, scrollProgress: 0 });
		vi.useRealTimers();
	});
});
