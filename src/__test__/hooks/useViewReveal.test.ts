import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { createElement, ReactNode } from "react";
import { useViewReveal } from "../../hooks/useViewReveal";

function wrapper({ children }: { children: ReactNode }) {
	return createElement(MantineProvider, null, children);
}

describe("useViewReveal", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Should start the new view transparent and offset when the view changes", () => {
		// Arrange

		const { result, rerender } = renderHook(
			({ view }) => useViewReveal(view, { offsetX: 16 }),
			{ wrapper, initialProps: { view: "list" } },
		);

		// Act

		rerender({ view: "form" });

		// Assert

		expect(result.current).toMatchObject({
			opacity: 0,
			transform: "translateX(16px)",
			transition: "none",
		});
	});

	it("Should animate the new view in when a frame has passed after the change", () => {
		// Arrange

		const { result, rerender } = renderHook(
			({ view }) => useViewReveal(view, { offsetX: 16, durationMs: 250 }),
			{ wrapper, initialProps: { view: "list" } },
		);
		rerender({ view: "form" });

		// Act

		act(() => {
			vi.advanceTimersToNextFrame();
		});

		// Assert

		expect(result.current).toMatchObject({
			opacity: 1,
			transform: undefined,
			transition: "opacity 250ms ease, transform 250ms ease",
		});
	});
});
