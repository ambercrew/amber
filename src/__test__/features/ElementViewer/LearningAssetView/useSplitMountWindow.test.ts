/* eslint-disable @typescript-eslint/no-empty-function */
import { createElement, ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSplitMountWindow } from "../../../../features/ElementViewer/LearningAssetView/useSplitMountWindow";
import { LearningAssetSplitMetaDto } from "../../../../types/elements/learningAssetSplitMetaDto";
import { MainScrollContext } from "../../../../features/App/context/mainScrollContext";

function makeSplits(count: number): LearningAssetSplitMetaDto[] {
	return Array.from({ length: count }, (_, index) => ({
		seq: index,
		charCount: 10,
	}));
}

/**
 * The hook observes the main content area's scroll container, so it needs one
 * from `MainScrollContext` to attach its `IntersectionObserver` to.
 */
function renderSplitMountWindow(props: {
	splits: LearningAssetSplitMetaDto[];
	initialSeq: number;
}) {
	const scroller = document.createElement("div");

	return renderHook(() => useSplitMountWindow(props), {
		wrapper: ({ children }: { children: ReactNode }) =>
			createElement(MainScrollContext, { value: scroller }, children),
	});
}

function sorted(seqs: Set<number>): number[] {
	return [...seqs].sort((a, b) => a - b);
}

describe("useSplitMountWindow", () => {
	it("Should mount only the window around the initial split", () => {
		// Arrange

		const splits = makeSplits(10);

		// Act

		const { result } = renderSplitMountWindow({ splits, initialSeq: 0 });

		// Assert

		// NEIGHBORS is 1, so the primary split (0) plus one below it.
		expect([...result.current.mountedSeqs].sort((a, b) => a - b)).toEqual([
			0, 1,
		]);
	});

	it("Should mount the window centered on a middle initial split", () => {
		// Arrange

		const splits = makeSplits(10);

		// Act

		const { result } = renderSplitMountWindow({ splits, initialSeq: 5 });

		// Assert

		expect([...result.current.mountedSeqs].sort((a, b) => a - b)).toEqual([
			4, 5, 6,
		]);
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
		observerCallback = null;
		window.IntersectionObserver =
			ControllableIntersectionObserver as unknown as typeof IntersectionObserver;
	});

	afterEach(() => {
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
		expect(sorted(result.current.mountedSeqs)).toEqual([4, 5, 6]);
	});

	it("Should follow the viewport once unlocked", () => {
		// Arrange

		const splits = makeSplits(10);
		const { result } = renderSplitMountWindow({ splits, initialSeq: 5 });
		const topSlot = document.createElement("div");
		act(() => {
			result.current.registerSlot(0)(topSlot);
		});

		// Act

		act(() => {
			result.current.unlock();
		});
		intersect(topSlot, true);

		// Assert

		expect(result.current.primarySeq).toBe(0);
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

		// Assert: locking in takes effect immediately.

		expect(result.current.primarySeq).toBe(5);
		expect(sorted(result.current.mountedSeqs)).toEqual([4, 5, 6]);

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
