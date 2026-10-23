import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadPointScroll } from "../../../../features/ElementViewer/LearningAssetView/useReadPointScroll";
import { ReadingPosition } from "../../../../types/elements/readingPosition";

/** A stand-in editable root with `blockCount` top-level block children. */
function makeRoot(blockCount: number): HTMLElement {
	const root = document.createElement("div");
	for (let i = 0; i < blockCount; i++) {
		root.appendChild(document.createElement("p"));
	}
	return root;
}

function renderReadPointScroll(overrides: {
	initial: ReadingPosition;
	getContentRoot: (seq: number) => HTMLElement | undefined;
	jumpTo?: () => void;
	releaseJump?: () => void;
}) {
	const {
		initial,
		getContentRoot,
		jumpTo = vi.fn(),
		releaseJump = vi.fn(),
	} = overrides;
	return renderHook(() =>
		useReadPointScroll({ initial, getContentRoot, jumpTo, releaseJump }),
	);
}

describe("useReadPointScroll", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("restore on open", () => {
		it("Should not restore when the ready split is not the target split", () => {
			// Arrange

			const root = makeRoot(3);
			const scrollIntoView = vi.fn();
			(root.children[0] as HTMLElement).scrollIntoView = scrollIntoView;
			const releaseJump = vi.fn();
			const { result } = renderReadPointScroll({
				initial: { split: 2, block: 0 },
				getContentRoot: () => root,
				releaseJump,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(1);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(result.current.restoredRef.current).toBe(false);
			expect(releaseJump).not.toHaveBeenCalled();
		});

		it("Should scroll the saved block into view and mark restored when the target split is ready", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[2] as HTMLElement).scrollIntoView = scrollIntoView;
			const releaseJump = vi.fn();
			const { result } = renderReadPointScroll({
				initial: { split: 3, block: 2 },
				getContentRoot: () => root,
				releaseJump,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(3);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
			expect(result.current.restoredRef.current).toBe(true);
			expect(releaseJump).toHaveBeenCalledTimes(1);
		});

		it("Should defer the scroll a frame so Lexical has painted the block rects", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[2] as HTMLElement).scrollIntoView = scrollIntoView;
			const { result } = renderReadPointScroll({
				initial: { split: 3, block: 2 },
				getContentRoot: () => root,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(3);
			});

			// Assert

			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(result.current.restoredRef.current).toBe(false);
		});

		it("Should restore only once when the target split becomes ready again", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[2] as HTMLElement).scrollIntoView = scrollIntoView;
			const { result } = renderReadPointScroll({
				initial: { split: 3, block: 2 },
				getContentRoot: () => root,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(3);
				vi.runAllTimers();
			});
			act(() => {
				result.current.notifySplitReady(3);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it("Should not scroll but should mark restored when the saved read point is the very start", () => {
			// Arrange

			const root = makeRoot(3);
			const scrollIntoView = vi.fn();
			(root.children[0] as HTMLElement).scrollIntoView = scrollIntoView;
			const releaseJump = vi.fn();
			const { result } = renderReadPointScroll({
				initial: { split: 0, block: 0 },
				getContentRoot: () => root,
				releaseJump,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(0);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(result.current.restoredRef.current).toBe(true);
			expect(releaseJump).toHaveBeenCalledTimes(1);
		});
	});

	describe("goToReadPoint", () => {
		it("Should scroll immediately when the target split is already mounted", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[3] as HTMLElement).scrollIntoView = scrollIntoView;
			const jumpTo = vi.fn();
			const { result } = renderReadPointScroll({
				initial: { split: 0, block: 0 },
				getContentRoot: () => root,
				jumpTo,
			});

			// Act

			act(() => {
				result.current.goToReadPoint({ split: 2, block: 3 });
			});

			// Assert

			expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
			expect(jumpTo).not.toHaveBeenCalled();
		});

		it("Should force the target split into the mount window when it isn't mounted yet", () => {
			// Arrange

			const jumpTo = vi.fn();
			const { result } = renderReadPointScroll({
				initial: { split: 0, block: 0 },
				getContentRoot: () => undefined,
				jumpTo,
			});

			// Act

			act(() => {
				result.current.goToReadPoint({ split: 5, block: 1 });
			});

			// Assert

			expect(jumpTo).toHaveBeenCalledWith(5);
		});

		it("Should defer the scroll a frame once the forced split reports ready, not scroll synchronously", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[1] as HTMLElement).scrollIntoView = scrollIntoView;
			// Not mounted yet at `goToReadPoint` time, mounted by the time
			// `notifySplitReady` fires — matches a split swapping from a
			// placeholder to a live editor after being forced into the window.
			const state: { root?: HTMLElement } = {};
			const { result } = renderReadPointScroll({
				initial: { split: 0, block: 0 },
				getContentRoot: () => state.root,
			});

			// Act

			act(() => {
				result.current.goToReadPoint({ split: 5, block: 1 });
			});
			state.root = root;
			act(() => {
				result.current.notifySplitReady(5);
			});

			// Assert: not yet scrolled — still waiting on the deferred frame.

			expect(scrollIntoView).not.toHaveBeenCalled();

			// Act

			act(() => {
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
		});

		it("Should release the jump once the forced split's scroll lands", () => {
			// Arrange

			const root = makeRoot(5);
			const state: { root?: HTMLElement } = {};
			const releaseJump = vi.fn();
			const { result } = renderReadPointScroll({
				initial: { split: 0, block: 0 },
				getContentRoot: () => state.root,
				releaseJump,
			});

			// Act

			act(() => {
				result.current.goToReadPoint({ split: 5, block: 1 });
			});
			state.root = root;
			act(() => {
				result.current.notifySplitReady(5);
				vi.runAllTimers();
			});

			// Assert

			expect(releaseJump).toHaveBeenCalledTimes(1);
		});

		it("Should ignore a ready split that isn't the pending goto target, and still resolve the real one", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[1] as HTMLElement).scrollIntoView = scrollIntoView;
			const state: { root?: HTMLElement } = {};
			const { result } = renderReadPointScroll({
				initial: { split: 0, block: 0 },
				getContentRoot: () => state.root,
			});

			// Act: force split 5 into the window, then some unrelated split
			// (e.g. a neighbour dragged in by the mount window) reports ready.

			act(() => {
				result.current.goToReadPoint({ split: 5, block: 1 });
			});
			state.root = root;
			act(() => {
				result.current.notifySplitReady(2);
				vi.runAllTimers();
			});

			// Assert: the unrelated split's readiness didn't consume the pending goto.

			expect(scrollIntoView).not.toHaveBeenCalled();

			// Act: the actual target split reports ready.

			act(() => {
				result.current.notifySplitReady(5);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
		});
	});
});
