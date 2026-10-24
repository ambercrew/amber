import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyedRefCallbacks } from "../../../../../features/ElementViewer/LearningAssetView/core/useKeyedRefCallbacks";

describe("useKeyedRefCallbacks", () => {
	it("Should return the same ref callback when called again with the same arguments", () => {
		// Arrange

		const create = vi.fn((seq: number) => (_element: Element | null) => {
			void seq;
		});
		const { result } = renderHook(() => useKeyedRefCallbacks(create));

		// Act

		const first = result.current(1);
		const second = result.current(1);

		// Assert

		expect(second).toBe(first);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it("Should return distinct ref callbacks when the arguments differ", () => {
		// Arrange

		const create =
			(seq: number, charCount: number) => (_element: Element | null) => {
				void seq;
				void charCount;
			};
		const { result } = renderHook(() => useKeyedRefCallbacks(create));

		// Act

		const first = result.current(1, 10);
		const second = result.current(1, 20);

		// Assert

		expect(second).not.toBe(first);
	});

	it("Should create fresh ref callbacks when the factory changes", () => {
		// Arrange

		const makeFactory =
			() => (seq: number) => (_element: Element | null) => {
				void seq;
			};
		const { result, rerender } = renderHook(
			({ create }) => useKeyedRefCallbacks(create),
			{ initialProps: { create: makeFactory() } },
		);
		const before = result.current(1);

		// Act

		rerender({ create: makeFactory() });
		const after = result.current(1);

		// Assert

		expect(after).not.toBe(before);
	});
});
