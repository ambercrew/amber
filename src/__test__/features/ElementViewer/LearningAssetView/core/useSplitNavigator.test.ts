import { createElement, ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainScrollContext } from "../../../../../features/App/context/mainScrollContext";
import { landOnBlock } from "../../../../../features/ElementViewer/LearningAssetView/core/landOnBlock";
import { useSplitNavigator } from "../../../../../features/ElementViewer/LearningAssetView/core/useSplitNavigator";
import { LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX } from "../../../../../features/ElementViewer/LearningAssetView/core/learningAssetViewConstants";
import { LearningAssetSplitMetaDto } from "../../../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";

/** A stand-in editable root with `blockCount` top-level block children. */
function makeRoot(blockCount: number): HTMLElement {
	const root = document.createElement("div");
	for (let i = 0; i < blockCount; i++) {
		root.appendChild(document.createElement("p"));
	}
	return root;
}

const SPLITS: LearningAssetSplitMetaDto[] = [1, 2, 3, 4, 5].map(seq => ({
	seq,
	charCount: 0,
	blockCount: 5,
}));
const SPLIT_HEIGHT_IN_PX = 1000;

function renderNavigator(overrides: {
	initial: ReadingPosition;
	getContentRoot: (seq: number) => HTMLElement | undefined;
	lockTo?: () => void;
	unlock?: () => void;
	scrollElement?: HTMLElement | null;
}) {
	const {
		initial,
		getContentRoot,
		lockTo = vi.fn(),
		unlock = vi.fn(),
		scrollElement = null,
	} = overrides;
	return renderHook(
		() =>
			useSplitNavigator({
				splits: SPLITS,
				initial,
				getContentRoot,
				getHeight: () => SPLIT_HEIGHT_IN_PX,
				lockTo,
				unlock,
			}),
		{
			wrapper: ({ children }: { children: ReactNode }) =>
				createElement(
					MainScrollContext,
					{ value: scrollElement },
					children,
				),
		},
	);
}

/** Navigates like "go to read point" does: to a block, scrolled to the top. */
function goTo(
	navigate: ReturnType<typeof useSplitNavigator>["navigate"],
	target: ReadingPosition,
) {
	navigate(target.split, landOnBlock(target.block));
}

describe("useSplitNavigator", () => {
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
			const unlock = vi.fn();
			const { result } = renderNavigator({
				initial: { split: 2, block: 0 },
				getContentRoot: () => root,
				unlock,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(1);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(result.current.restoredRef.current).toBe(false);
			expect(unlock).not.toHaveBeenCalled();
		});

		it("Should scroll the saved block into view and mark restored when the target split is ready", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[2] as HTMLElement).scrollIntoView = scrollIntoView;
			const unlock = vi.fn();
			const { result } = renderNavigator({
				initial: { split: 3, block: 2 },
				getContentRoot: () => root,
				unlock,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(3);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
			expect(result.current.restoredRef.current).toBe(true);
			expect(unlock).toHaveBeenCalledTimes(1);
		});

		it("Should defer the scroll a frame so Lexical has painted the block rects", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[2] as HTMLElement).scrollIntoView = scrollIntoView;
			const { result } = renderNavigator({
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
			const { result } = renderNavigator({
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
			const unlock = vi.fn();
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => root,
				unlock,
			});

			// Act

			act(() => {
				result.current.notifySplitReady(0);
				vi.runAllTimers();
			});

			// Assert

			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(result.current.restoredRef.current).toBe(true);
			expect(unlock).toHaveBeenCalledTimes(1);
		});
	});

	describe("navigate", () => {
		it("Should scroll immediately when the target split is already mounted", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[3] as HTMLElement).scrollIntoView = scrollIntoView;
			const lockTo = vi.fn();
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => root,
				lockTo,
			});

			// Act

			act(() => {
				goTo(result.current.navigate, { split: 2, block: 3 });
			});

			// Assert

			expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
			expect(lockTo).not.toHaveBeenCalled();
		});

		it("Should drop an earlier pending jump when a later one lands on an already mounted split", () => {
			// Arrange

			const mountedRoot = makeRoot(5);
			const lateRoot = makeRoot(5);
			const lateScroll = vi.fn();
			(lateRoot.children[1] as HTMLElement).scrollIntoView = lateScroll;
			const roots = new Map<number, HTMLElement>([[2, mountedRoot]]);
			const unlock = vi.fn();
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: seq => roots.get(seq),
				unlock,
			});
			act(() => {
				goTo(result.current.navigate, { split: 5, block: 1 });
			});

			// Act

			act(() => {
				goTo(result.current.navigate, { split: 2, block: 3 });
			});
			roots.set(5, lateRoot);
			act(() => {
				result.current.notifySplitReady(5);
				vi.runAllTimers();
			});

			// Assert

			expect(lateScroll).not.toHaveBeenCalled();
			expect(unlock).toHaveBeenCalledTimes(1);
		});

		it("Should wait for the split to be ready when navigating to a split that's still mounting", () => {
			// Arrange

			const root = makeRoot(5);
			const restoreScroll = vi.fn();
			const laterLand = vi.fn();
			(root.children[2] as HTMLElement).scrollIntoView = restoreScroll;
			const { result } = renderNavigator({
				initial: { split: 3, block: 2 },
				getContentRoot: () => root,
			});

			// Act

			act(() => {
				result.current.navigate(3, laterLand);
			});
			const landedEarly = laterLand.mock.calls.length;
			act(() => {
				result.current.notifySplitReady(3);
				vi.runAllTimers();
			});

			// Assert

			expect(landedEarly).toBe(0);
			expect(laterLand).toHaveBeenCalledWith(root);
			expect(restoreScroll).not.toHaveBeenCalled();
		});

		it("Should force the target split into the mount window when it isn't mounted yet", () => {
			// Arrange

			const lockTo = vi.fn();
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => undefined,
				lockTo,
			});

			// Act

			act(() => {
				goTo(result.current.navigate, { split: 5, block: 1 });
			});

			// Assert

			expect(lockTo).toHaveBeenCalledWith(5);
		});

		it("Should defer the scroll a frame once the forced split reports ready, not scroll synchronously", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[1] as HTMLElement).scrollIntoView = scrollIntoView;
			// Not mounted yet at `navigate` time, mounted by the time
			// `notifySplitReady` fires — matches a split swapping from a
			// placeholder to a live editor after being forced into the window.
			const state: { root?: HTMLElement } = {};
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => state.root,
			});

			// Act

			act(() => {
				goTo(result.current.navigate, { split: 5, block: 1 });
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
			const unlock = vi.fn();
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => state.root,
				unlock,
			});

			// Act

			act(() => {
				goTo(result.current.navigate, { split: 5, block: 1 });
			});
			state.root = root;
			act(() => {
				result.current.notifySplitReady(5);
				vi.runAllTimers();
			});

			// Assert

			expect(unlock).toHaveBeenCalledTimes(1);
		});

		it("Should ignore a ready split that isn't the pending goto target, and still resolve the real one", () => {
			// Arrange

			const root = makeRoot(5);
			const scrollIntoView = vi.fn();
			(root.children[1] as HTMLElement).scrollIntoView = scrollIntoView;
			const state: { root?: HTMLElement } = {};
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => state.root,
			});

			// Act: force split 5 into the window, then some unrelated split
			// (e.g. a neighbour dragged in by the mount window) reports ready.

			act(() => {
				goTo(result.current.navigate, { split: 5, block: 1 });
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
		it("Should pre-scroll to the split's estimated offset when it isn't mounted yet", () => {
			// Arrange

			const scrollElement = document.createElement("div");
			const scrollTo = vi.fn();
			scrollElement.scrollTo = scrollTo;
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => undefined,
				scrollElement,
			});

			// Act

			act(() => {
				result.current.navigate(3, vi.fn());
			});

			// Assert

			expect(scrollTo).toHaveBeenCalledWith({
				top:
					2 * SPLIT_HEIGHT_IN_PX -
					LEARNING_ASSET_VIEWPORT_TOP_OFFSET_IN_PX,
				behavior: "instant",
			});
		});

		it("Should not pre-scroll when the split is already mounted", () => {
			// Arrange

			const scrollElement = document.createElement("div");
			const scrollTo = vi.fn();
			scrollElement.scrollTo = scrollTo;
			const land = vi.fn();
			const root = makeRoot(1);
			const { result } = renderNavigator({
				initial: { split: 0, block: 0 },
				getContentRoot: () => root,
				scrollElement,
			});

			// Act

			act(() => {
				result.current.navigate(3, land);
			});

			// Assert

			expect(scrollTo).not.toHaveBeenCalled();
			expect(land).toHaveBeenCalledWith(root);
		});

		it("Should mark restored when a navigation replaced the pending restore before it landed", () => {
			// Arrange

			const state: { root?: HTMLElement } = {};
			const { result } = renderNavigator({
				initial: { split: 2, block: 1 },
				getContentRoot: () => state.root,
			});

			// Act

			act(() => {
				goTo(result.current.navigate, { split: 5, block: 1 });
			});
			state.root = makeRoot(5);
			act(() => {
				result.current.notifySplitReady(5);
				vi.runAllTimers();
			});

			// Assert

			expect(result.current.restoredRef.current).toBe(true);
		});
	});
});
