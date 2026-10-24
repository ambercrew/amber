/* eslint-disable @typescript-eslint/no-empty-function */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSplitHeights } from "../../../../../../features/ElementViewer/LearningAssetView/core/heights/useSplitHeights";
import { estimateSplitHeight } from "../../../../../../features/ElementViewer/LearningAssetView/core/heights/estimateSplitHeight";

let observeCallback: ResizeObserverCallback | null = null;
const disconnect = vi.fn();

class ControllableResizeObserver {
	constructor(callback: ResizeObserverCallback) {
		observeCallback = callback;
	}
	observe() {}
	unobserve() {}
	disconnect = disconnect;
}

function triggerResize(element: HTMLElement, offsetHeight: number) {
	Object.defineProperty(element, "offsetHeight", {
		configurable: true,
		value: offsetHeight,
	});
	observeCallback?.([], new ControllableResizeObserver(() => {}));
}

describe("useSplitHeights", () => {
	const originalResizeObserver = window.ResizeObserver;

	beforeEach(() => {
		window.localStorage.clear();
		observeCallback = null;
		disconnect.mockClear();
		window.ResizeObserver =
			ControllableResizeObserver as unknown as typeof ResizeObserver;
	});

	afterEach(() => {
		window.ResizeObserver = originalResizeObserver;
	});

	it("Should return an estimate when no height was measured or stored", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSplitHeights("learningAsset-1", 720),
		);

		// Act

		const actual = result.current.getHeight(0, 1000);

		// Assert

		expect(actual).toBe(estimateSplitHeight(1000, 720));
	});

	it("Should return the same ref callback for the same seq when charCount is unchanged", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSplitHeights("learningAsset-1", 720),
		);

		// Act

		const first = result.current.observeSplit(0, 1000);
		const second = result.current.observeSplit(0, 1000);

		// Assert

		expect(first).toBe(second);
	});

	it("Should return a different ref callback for the same seq when charCount changes", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSplitHeights("learningAsset-1", 720),
		);

		// Act

		const first = result.current.observeSplit(0, 1000);
		const second = result.current.observeSplit(0, 2000);

		// Assert

		expect(first).not.toBe(second);
	});

	it("Should update getHeight with the measured height once the ResizeObserver reports a resize", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSplitHeights("learningAsset-1", 720),
		);
		const element = document.createElement("div");
		vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
			top: 200,
		} as DOMRect);

		// Act

		act(() => result.current.observeSplit(0, 1000)(element));
		act(() => triggerResize(element, 900));

		// Assert

		expect(result.current.getHeight(0, 1000)).toBe(900);
	});

	it("Should disconnect the previous observer when the ref callback runs again with a new element", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSplitHeights("learningAsset-1", 720),
		);
		const observeSplit = result.current.observeSplit(0, 1000);
		const first = document.createElement("div");

		// Act

		act(() => observeSplit(first));
		act(() => observeSplit(null));

		// Assert

		expect(disconnect).toHaveBeenCalledTimes(1);
	});
});
