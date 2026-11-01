/* eslint-disable @typescript-eslint/no-empty-function */
import { createElement, ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSplitMountWindow } from "../../../../../features/ElementViewer/LearningAssetView/core/useSplitMountWindow";
import { SCROLL_SETTLE_IN_MILLISECONDS } from "../../../../../features/ElementViewer/scrollPace";
import { LearningAssetSplitMetaDto } from "../../../../../types/elements/learningAssetSplitMetaDto";
import { MainScrollContext } from "../../../../../features/App/context/mainScrollContext";

function makeSplits(count: number): LearningAssetSplitMetaDto[] {
	return Array.from({ length: count }, (_, index) => ({
		seq: index,
		charCount: 10,
		blockCount: 1,
	}));
}

/**
 * The hook observes the main content area's scroll container, so it needs one
 * from `MainScrollContext` to attach its `IntersectionObserver` to.
 */
function renderSplitMountWindow(
	props: {
		splits: LearningAssetSplitMetaDto[];
		initialSeq: number;
	},
	scroller: HTMLElement = document.createElement("div"),
) {
	return renderHook(() => useSplitMountWindow(props), {
		wrapper: ({ children }: { children: ReactNode }) =>
			createElement(MainScrollContext, { value: scroller }, children),
	});
}

function sorted(seqs: Set<number>): number[] {
	return [...seqs].sort((a, b) => a - b);
}

describe("useSplitMountWindow", () => {
	it("Should mount only the initial split when it opens", () => {
		// Arrange

		const splits = makeSplits(10);

		// Act

		const { result } = renderSplitMountWindow({ splits, initialSeq: 5 });

		// Assert

		expect(sorted(result.current.mountedSeqs)).toEqual([5]);
	});

	it("Should mount the neighbours around the initial split when unlocked", () => {
		// Arrange

		const splits = makeSplits(10);
		const { result } = renderSplitMountWindow({ splits, initialSeq: 5 });

		// Act

		act(() => {
			result.current.unlock();
		});

		// Assert

		expect(sorted(result.current.mountedSeqs)).toEqual([4, 5, 6]);
	});

	it("Should mount only the neighbour below when unlocked on the first split", () => {
		// Arrange

		const splits = makeSplits(10);
		const { result } = renderSplitMountWindow({ splits, initialSeq: 0 });

		// Act

		act(() => {
			result.current.unlock();
		});

		// Assert

		// NEIGHBORS is 1, so the primary split (0) plus one below it.
		expect(sorted(result.current.mountedSeqs)).toEqual([0, 1]);
	});
});

describe("useSplitMountWindow lock/unlock gating", () => {
	const originalObserver = window.IntersectionObserver;
	let observerCallback: IntersectionObserverCallback | null = null;

	class ControllableIntersectionObserver {
		constructor(callback: IntersectionObserverCallback) {
			observerCallback = callback;
		}
		observe() {}
		unobserve() {}
		disconnect() {}
		takeRecords() {
			return [];
		}
	}

	beforeEach(() => {
		vi.useFakeTimers();
		observerCallback = null;
		window.IntersectionObserver =
			ControllableIntersectionObserver as unknown as typeof IntersectionObserver;
	});

	afterEach(() => {
		vi.useRealTimers();
		window.IntersectionObserver = originalObserver;
	});

	function intersect(target: Element, isIntersecting: boolean) {
		act(() => {
			observerCallback?.(
				[{ target, isIntersecting } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
		});
	}

	it("Should keep the window locked to the initial split until unlocked", () => {
		// Arrange

		const splits = makeSplits(10);
		const { result } = renderSplitMountWindow({ splits, initialSeq: 5 });
		const topSlot = document.createElement("div");
		act(() => {
			result.current.registerSlot(0)(topSlot);
		});

		// Act

		// The document opens at the top, so the top split reports as intersecting.
		intersect(topSlot, true);

		// Assert

		expect(result.current.primarySeq).toBe(5);
		expect(sorted(result.current.mountedSeqs)).toEqual([5]);
	});

	function makeScroller(clientHeight: number) {
		const scroller = document.createElement("div");
		Object.defineProperty(scroller, "clientHeight", {
			value: clientHeight,
		});
		return scroller;
	}

	function scrollTo(scroller: HTMLElement, top: number) {
		scroller.scrollTop = top;
		scroller.dispatchEvent(new Event("scroll"));
	}

	function renderUnlocked(initialSeq: number, scroller: HTMLElement) {
		const rendered = renderSplitMountWindow(
			{ splits: makeSplits(10), initialSeq },
			scroller,
		);
		const slots = Array.from({ length: 10 }, () =>
			document.createElement("div"),
		);
		act(() => {
			slots.forEach((slot, seq) =>
				rendered.result.current.registerSlot(seq)(slot),
			);
			rendered.result.current.unlock();
		});
		return { ...rendered, slots };
	}

	it("Should move the window at once when the new top split is already mounted", () => {
		// Arrange

		const scroller = makeScroller(1000);
		const { result, slots } = renderUnlocked(5, scroller);
		intersect(slots[5], true);

		// Act

		scrollTo(scroller, 100);
		intersect(slots[5], false);
		intersect(slots[6], true);

		// Assert

		expect(result.current.primarySeq).toBe(6);
		expect(sorted(result.current.mountedSeqs)).toEqual([5, 6, 7]);
	});

	it("Should mount the split the viewport stopped on when a jump past the window settles", () => {
		// Arrange

		const scroller = makeScroller(1000);
		const { result, slots } = renderUnlocked(5, scroller);

		// Act

		intersect(slots[0], true);

		// Assert: the top split is tracked at once, but nothing mounts while the scroll may go on.

		expect(result.current.primarySeq).toBe(0);
		expect(sorted(result.current.mountedSeqs)).toEqual([4, 5, 6]);

		// Act

		act(() => {
			vi.advanceTimersByTime(SCROLL_SETTLE_IN_MILLISECONDS);
		});

		// Assert: only the split it stopped on mounts first.

		expect(sorted(result.current.mountedSeqs)).toEqual([0]);

		// Act

		act(() => {
			result.current.notifySplitReady(0);
			vi.advanceTimersByTime(16);
		});

		// Assert

		expect(sorted(result.current.mountedSeqs)).toEqual([0, 1]);
	});

	it("Should not mount splits flown past when scrolling fast", () => {
		// Arrange

		const scroller = makeScroller(1000);
		const { result, slots } = renderUnlocked(5, scroller);
		intersect(slots[5], true);

		// Act

		scrollTo(scroller, 0);
		scrollTo(scroller, 3000);
		intersect(slots[5], false);
		intersect(slots[6], true);
		act(() => {
			vi.advanceTimersByTime(SCROLL_SETTLE_IN_MILLISECONDS / 2);
		});
		scrollTo(scroller, 6000);
		intersect(slots[6], false);
		intersect(slots[7], true);

		// Assert: still scrolling, so the window stays put.

		expect(result.current.primarySeq).toBe(7);
		expect(sorted(result.current.mountedSeqs)).toEqual([4, 5, 6]);

		// Act

		act(() => {
			vi.advanceTimersByTime(SCROLL_SETTLE_IN_MILLISECONDS);
		});

		// Assert

		expect(sorted(result.current.mountedSeqs)).toEqual([7]);
	});

	it("Should follow the viewport when a fast scroll slows to reading", () => {
		// Arrange

		const scroller = makeScroller(1000);
		const { result, slots } = renderUnlocked(5, scroller);
		intersect(slots[5], true);
		scrollTo(scroller, 0);
		scrollTo(scroller, 3000);
		intersect(slots[5], false);
		intersect(slots[6], true);

		// Act: keep scrolling slowly, faster than the settle delay, until the fast samples age out.

		for (let top = 3010; top <= 3040; top += 10) {
			act(() => {
				vi.advanceTimersByTime(40);
			});
			scrollTo(scroller, top);
		}
		act(() => {
			vi.advanceTimersByTime(20);
		});

		// Assert: the settle the last fast sample scheduled fired despite the slow scroll events after it.

		expect(sorted(result.current.mountedSeqs)).toEqual([5, 6, 7]);
	});

	it("Should mount the neighbours when the centre isn't a split", () => {
		// Arrange

		const { result } = renderSplitMountWindow({
			splits: makeSplits(10),
			initialSeq: 42,
		});
		act(() => {
			result.current.unlock();
			result.current.lockTo(42);
		});
		act(() => {
			result.current.unlock();
		});

		// Assert

		expect(sorted(result.current.mountedSeqs)).toEqual([0, 1]);
	});

	it("Should force the window onto lockTo's target, ignoring the observer until unlock", () => {
		// Arrange

		const splits = makeSplits(10);
		const { result } = renderSplitMountWindow({ splits, initialSeq: 0 });
		act(() => {
			result.current.unlock();
		});
		const topSlot = document.createElement("div");
		act(() => {
			result.current.registerSlot(0)(topSlot);
		});

		// Act

		act(() => {
			result.current.lockTo(5);
		});

		// Assert: locking in takes effect immediately, mounting just the target until it lands.

		expect(result.current.primarySeq).toBe(5);
		expect(sorted(result.current.mountedSeqs)).toEqual([5]);

		// Act: the real viewport hasn't caught up yet, so the observer still
		// reports the old top split as intersecting — this must not override
		// the lock.

		intersect(topSlot, true);

		// Assert

		expect(result.current.primarySeq).toBe(5);

		// Act: once released, the observer drives `primarySeq` again.

		act(() => {
			result.current.unlock();
		});
		intersect(topSlot, true);

		// Assert

		expect(result.current.primarySeq).toBe(0);
	});
});
