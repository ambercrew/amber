import { createElement, ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadPoint } from "../../../../features/ElementViewer/LearningAssetView/useReadPoint";
import { AUTO_SAVE_DELAY_IN_MILLISECONDS } from "../../../../config/constants";
import { ReadPoint } from "../../../../types/elements/readPoint";
import { READ_POINT_MANUAL_SET_REQUESTED } from "../../../../types/events/readPointManualSetRequestedEvent";
import { READ_POINT_MANUAL_CLEAR_REQUESTED } from "../../../../types/events/readPointManualClearRequestedEvent";
import { MainScrollContext } from "../../../../features/App/context/mainScrollContext";

const { updateReadPointMock } = vi.hoisted(() => ({
	updateReadPointMock: vi.fn(),
}));

vi.mock("../../../../api/elements/api/elementsApi", () => ({
	updateReadPoint: updateReadPointMock,
}));

// useAutoSave wires itself into the app-close and sync managers (both backed by
// Tauri) on mount. Stub them so the hook exercises only its save/flush logic.
vi.mock("../../../../managers/closeRequestedEventManager", () => ({
	defaultCloseRequestedEventManager: {
		addHandler: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

vi.mock("../../../../stores/sync/managers/syncEventManager", () => ({
	defaultGlobalSyncEventManager: {
		addListener: vi.fn(),
		removeListener: vi.fn(),
	},
	ListenerType: {
		PreSyncStart: "PreSyncStart",
		PreSyncComplete: "PreSyncComplete",
	},
}));

/** A stand-in editable root with `blockCount` top-level block children. */
function makeRoot(blockCount: number): HTMLElement {
	const root = document.createElement("div");
	for (let i = 0; i < blockCount; i++) {
		root.appendChild(document.createElement("p"));
	}
	return root;
}

function rect(bottom: number): DOMRect {
	return {
		x: 0,
		y: 0,
		top: 0,
		left: 0,
		right: 0,
		bottom,
		width: 0,
		height: 0,
		toJSON: () => ({}),
	} as DOMRect;
}

/** Sets each block's `getBoundingClientRect().bottom`, so the top-offset scan is
 * deterministic without a layout engine. */
function setBlockBottoms(root: HTMLElement, bottoms: number[]) {
	Array.from(root.children).forEach((child, i) => {
		child.getBoundingClientRect = () => rect(bottoms[i]);
	});
}

// Blocks 0–1 are scrolled above the viewport top (56px); block 2 is the first
// one still visible, so the saved `block` should be 2.
const BOTTOMS_TOP_VISIBLE_IS_TWO = [10, 10, 100, 100, 100];

/** A stand-in for the main content area's scroll container, whose bottom edge
 * matches jsdom's default `window.innerHeight` (768) so "is at document end"
 * checks behave the same as when the window itself used to scroll. */
function makeScrollElement(): HTMLElement {
	const scrollElement = document.createElement("div");
	scrollElement.getBoundingClientRect = () => rect(768);
	return scrollElement;
}

function renderReadPoint(overrides: {
	root: HTMLElement | undefined;
	primarySeq: number;
	initial: ReadPoint;
	restoredRef: { current: boolean };
	learningAssetId?: string;
	lastSplitSeq?: number;
	onReadPointChange?: (readPoint: ReadPoint) => void;
}) {
	const {
		root,
		primarySeq,
		initial,
		restoredRef,
		learningAssetId = "r1",
		lastSplitSeq,
		onReadPointChange,
	} = overrides;
	const scrollElement = makeScrollElement();
	const rendered = renderHook(
		() =>
			useReadPoint({
				learningAssetId,
				primarySeq,
				initial,
				getContentRoot: () => root,
				lastSplitSeq,
				restoredRef,
				onReadPointChange,
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
	return { ...rendered, scrollElement };
}

describe("useReadPoint", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		updateReadPointMock.mockResolvedValue(undefined);
		window.scrollBy = vi.fn();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Should not persist the read point on scroll before restore has landed", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: false };
		const { scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).not.toHaveBeenCalled();
	});

	it("Should persist the top visible block after scrolling once restored", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 2 },
		});
	});

	it("Should clear the read point when scrolling reaches the absolute end of the last split", async () => {
		// Arrange

		const root = makeRoot(5);
		// The last block's bottom edge (100) is within the viewport
		// (jsdom's default window.innerHeight is 768), so the reader has
		// scrolled all the way to the end of this, the learning asset's last split.
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
			lastSplitSeq: 4,
		});

		// Act

		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 0, block: 0 },
		});
	});

	it("Should not clear when the primary split is not the learning asset's last split", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
			lastSplitSeq: 5,
		});

		// Act

		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 2 },
		});
	});

	it("Should not persist a read point identical to the last saved one", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			// Last-saved is seeded from `initial`, and the scroll resolves to
			// block 2 as well, so there is nothing new to write.
			initial: { split: 4, block: 2 },
			restoredRef,
		});

		// Act

		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).not.toHaveBeenCalled();
	});

	it("Should flush the pending read point when unmounting before the debounce fires", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { unmount, scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		// Run the scroll's rAF (records the read point) but not the autosave debounce.
		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.advanceTimersByTimeAsync(20);
		});
		const savedBeforeUnmount = updateReadPointMock.mock.calls.length;
		act(() => {
			unmount();
		});

		// Assert

		expect(savedBeforeUnmount).toBe(0);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 2 },
		});
	});

	it("Should not flush anything on unmount when the debounce delay has already elapsed", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { unmount, scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.advanceTimersByTimeAsync(
				20 + AUTO_SAVE_DELAY_IN_MILLISECONDS,
			);
		});
		act(() => {
			unmount();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
	});

	it("Should persist the read point when an extract is created", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		await act(async () => {
			result.current.recordExtractReadPoint(4, 3);
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 3 },
		});
	});

	it("Should stop automatic tracking after an extract is created", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { result, scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		await act(async () => {
			result.current.recordExtractReadPoint(4, 3);
			await vi.runAllTimersAsync();
		});
		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 3 },
		});
	});

	it("Should not let an extract relocate a read point that was already set manually", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});
		act(() => {
			result.current.trackCursor(4, 3);
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
		});

		// Act

		await act(async () => {
			result.current.recordExtractReadPoint(4, 1);
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 3 },
		});
	});

	it("Should let a manual set override a read point that was already set by an extract", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});
		await act(async () => {
			result.current.recordExtractReadPoint(4, 1);
			result.current.trackCursor(4, 3);
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 3 },
		});
	});

	it("Should persist the last tracked cursor position when a manual set is requested", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});
		act(() => {
			result.current.trackCursor(4, 3);
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 3 },
		});
	});

	it("Should fall back to the top visible block when a manual set is requested and no cursor has been tracked yet", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 2 },
		});
	});

	it("Should stop automatic tracking after a manual set is requested", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { result, scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});
		act(() => {
			result.current.trackCursor(4, 3);
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
			await vi.runAllTimersAsync();
		});
		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 4, block: 3 },
		});
	});

	it("Should clear the read point when a manual clear is requested", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 3 },
			restoredRef,
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_CLEAR_REQUESTED));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 0, block: 0 },
		});
	});

	it("Should stop automatic tracking after a manual clear is requested", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const { scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 3 },
			restoredRef,
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_CLEAR_REQUESTED));
			await vi.runAllTimersAsync();
		});
		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: "r1",
			readPoint: { split: 0, block: 0 },
		});
	});

	it("Should return the initial read point from getCurrentReadPoint before anything is recorded", () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 3 },
			restoredRef,
		});

		// Act

		const actual = result.current.getCurrentReadPoint();

		// Assert

		expect(actual).toEqual({ split: 4, block: 3 });
	});

	it("Should reflect the latest recorded read point from getCurrentReadPoint", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
		});

		// Act

		await act(async () => {
			result.current.recordExtractReadPoint(4, 3);
			await vi.runAllTimersAsync();
		});
		const actual = result.current.getCurrentReadPoint();

		// Assert

		expect(actual).toEqual({ split: 4, block: 3 });
	});

	it("Should call onReadPointChange with the new read point when a manual set is requested", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const onReadPointChange = vi.fn();
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
			onReadPointChange,
		});
		act(() => {
			result.current.trackCursor(4, 3);
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(onReadPointChange).toHaveBeenCalledWith({ split: 4, block: 3 });
	});

	it("Should call onReadPointChange with the cleared read point when a manual clear is requested", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const onReadPointChange = vi.fn();
		renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 3 },
			restoredRef,
			onReadPointChange,
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_CLEAR_REQUESTED));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(onReadPointChange).toHaveBeenCalledWith({ split: 0, block: 0 });
	});

	it("Should not call onReadPointChange when an extract is created", async () => {
		// Arrange

		const root = makeRoot(5);
		const restoredRef = { current: true };
		const onReadPointChange = vi.fn();
		const { result } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
			onReadPointChange,
		});

		// Act

		await act(async () => {
			result.current.recordExtractReadPoint(4, 3);
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(onReadPointChange).not.toHaveBeenCalled();
	});

	it("Should not call onReadPointChange for automatic scroll-tracking", async () => {
		// Arrange

		const root = makeRoot(5);
		setBlockBottoms(root, BOTTOMS_TOP_VISIBLE_IS_TWO);
		const restoredRef = { current: true };
		const onReadPointChange = vi.fn();
		const { scrollElement } = renderReadPoint({
			root,
			primarySeq: 4,
			initial: { split: 4, block: 0 },
			restoredRef,
			onReadPointChange,
		});

		// Act

		await act(async () => {
			scrollElement.dispatchEvent(new Event("scroll"));
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(onReadPointChange).not.toHaveBeenCalled();
	});
});
