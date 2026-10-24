/* eslint-disable @typescript-eslint/no-empty-function */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentWidth } from "../../../../../features/ElementViewer/LearningAssetView/core/useContentWidth";

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

function setClientWidth(element: HTMLElement, clientWidth: number) {
	Object.defineProperty(element, "clientWidth", {
		configurable: true,
		value: clientWidth,
	});
}

function triggerResize() {
	observeCallback?.([], new ControllableResizeObserver(() => {}));
}

describe("useContentWidth", () => {
	const originalResizeObserver = window.ResizeObserver;

	beforeEach(() => {
		observeCallback = null;
		disconnect.mockClear();
		window.ResizeObserver =
			ControllableResizeObserver as unknown as typeof ResizeObserver;
	});

	afterEach(() => {
		window.ResizeObserver = originalResizeObserver;
	});

	it("Should return 0 when no node is attached", () => {
		// Arrange

		// Act

		const { result } = renderHook(() => useContentWidth());

		// Assert

		expect(result.current[0]).toBe(0);
	});

	it("Should measure the rounded width when a node attaches", () => {
		// Arrange

		const { result } = renderHook(() => useContentWidth());
		const node = document.createElement("div");
		setClientWidth(node, 717);

		// Act

		act(() => {
			result.current[1](node);
		});

		// Assert

		expect(result.current[0]).toBe(720);
	});

	it("Should update the width when the attached node resizes", () => {
		// Arrange

		const { result } = renderHook(() => useContentWidth());
		const node = document.createElement("div");
		setClientWidth(node, 720);
		act(() => {
			result.current[1](node);
		});

		// Act

		setClientWidth(node, 1094);
		act(() => {
			triggerResize();
		});

		// Assert

		expect(result.current[0]).toBe(1090);
	});

	it("Should disconnect the observer when the ref cleanup runs", () => {
		// Arrange

		const { result } = renderHook(() => useContentWidth());
		const node = document.createElement("div");
		let cleanup: (() => void) | undefined;
		act(() => {
			cleanup = result.current[1](node);
		});

		// Act

		cleanup?.();

		// Assert

		expect(disconnect).toHaveBeenCalledTimes(1);
	});
});
