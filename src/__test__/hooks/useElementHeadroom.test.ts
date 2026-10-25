import { act, renderHook } from "@testing-library/react";
import {
	hideHeadroom,
	useElementHeadroom,
} from "../../hooks/useElementHeadroom";

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

		expect(result.current.pinned).toBe(true);
	});

	it("Should stay fully pinned when the scroller is within the fixed zone", () => {
		// Arrange

		const { result } = render();

		// Act

		scrollTo(100);

		// Assert

		expect(result.current.pinned).toBe(true);
	});

	it("Should partially hide when scrolled down less than the scroll distance past the fixed zone", () => {
		// Arrange

		const { result } = render();

		// Act

		scrollTo(140);

		// Assert

		expect(result.current.pinned).toBe(true);
	});

	it("Should fully hide when scrolled down a full scroll distance past the fixed zone", () => {
		// Arrange

		const { result } = render();

		// Act

		scrollTo(200);

		// Assert

		expect(result.current.pinned).toBe(false);
	});

	it("Should not hide before the scroll distance is exceeded when a longer distance is given", () => {
		// Arrange

		const { result } = render(100, 400);

		// Act

		scrollTo(300);

		// Assert

		expect(result.current.pinned).toBe(true);
	});

	it("Should reveal again from where it stopped when the direction changes", () => {
		// Arrange

		const { result } = render();
		scrollTo(170);

		// Act

		scrollTo(150);

		// Assert

		expect(result.current.pinned).toBe(true);
	});

	it("Should be fully revealed when scrolled up a full scroll distance", () => {
		// Arrange

		const { result } = render();
		scrollTo(400);

		// Act

		scrollTo(390);
		scrollTo(280);

		// Assert

		expect(result.current.pinned).toBe(true);
	});

	it("Should not hide when content resizing above shifts the scroller down while scrolling up", () => {
		// Arrange

		let scrollHeight = 5000;
		Object.defineProperty(element, "scrollHeight", {
			get: () => scrollHeight,
		});
		const { result } = render();
		scrollTo(1000);
		scrollTo(990);
		scrollTo(800);

		// Act

		scrollHeight = 5600;
		scrollTo(1400);
		scrollTo(1390);

		// Assert

		expect(result.current.pinned).toBe(true);
	});

	it("Should not count the shift toward hiding when scrolling down resumes after content resized", () => {
		// Arrange

		let scrollHeight = 5000;
		Object.defineProperty(element, "scrollHeight", {
			get: () => scrollHeight,
		});
		const { result } = render();
		scrollTo(1000);
		scrollTo(990);
		scrollTo(800);
		scrollTo(810);

		// Act

		scrollHeight = 5600;
		scrollTo(1410);
		scrollTo(1450);

		// Assert

		expect(result.current.pinned).toBe(true);
	});

	it("Should be fully pinned again when scrolled back into the fixed zone", () => {
		// Arrange

		const { result } = render();
		scrollTo(400);

		// Act

		scrollTo(50);

		// Assert

		expect(result.current.pinned).toBe(true);
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

		expect(result.current.pinned).toBe(true);
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

		expect(result.current.pinned).toBe(false);
		vi.useRealTimers();
	});

	describe("hideHeadroom", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		/** Jumps to `scrollTop` the way a jump does: scroll, hide, then the scroll's own event arrives. */
		function jumpTo(scrollTop: number) {
			element.scrollTop = scrollTop;
			act(() => {
				hideHeadroom(element);
				element.dispatchEvent(new Event("scroll"));
			});
		}

		it("Should hide when a jump scrolls up but lands past the fixed zone", () => {
			// Arrange

			const { result } = render();
			scrollTo(1000);
			scrollTo(900);

			// Act

			jumpTo(500);

			// Assert

			expect(result.current.pinned).toBe(false);
		});

		it("Should hide when the jump's scroll arrives late and the scroller was paused", () => {
			// Arrange

			const { result } = render();
			act(() => {
				result.current.pause();
				hideHeadroom(element);
				vi.advanceTimersByTime(200);
			});

			// Act

			scrollTo(1000);

			// Assert

			expect(result.current.pinned).toBe(false);
		});

		it("Should stay pinned when a jump lands within the fixed zone", () => {
			// Arrange

			const { result } = render();
			scrollTo(1000);

			// Act

			jumpTo(50);

			// Assert

			expect(result.current.pinned).toBe(true);
		});

		it("Should reveal again when scrolling up by hand after a jump has settled", () => {
			// Arrange

			const { result } = render();
			jumpTo(1000);
			act(() => {
				vi.advanceTimersByTime(1000);
			});

			// Act

			scrollTo(990);
			scrollTo(890);

			// Assert

			expect(result.current.pinned).toBe(true);
		});
	});
});
