import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getLayoutMap = vi.fn<() => Promise<ReadonlyMap<string, string>>>();

/** A fresh copy of the module, since the layout is shared at module level. */
async function importHook() {
	vi.resetModules();
	const { useKeyboardLayoutMap } =
		await import("../../commands/useKeyboardLayoutMap");
	return useKeyboardLayoutMap;
}

describe("useKeyboardLayoutMap", () => {
	beforeEach(() => {
		getLayoutMap.mockResolvedValue(new Map([["KeyK", "k"]]));
		Object.defineProperty(navigator, "keyboard", {
			value: { getLayoutMap },
			configurable: true,
		});
	});

	afterEach(() => {
		Reflect.deleteProperty(navigator, "keyboard");
		vi.clearAllMocks();
	});

	it("Should fetch the layout once when several components read it", async () => {
		// Arrange

		const useKeyboardLayoutMap = await importHook();

		// Act

		const first = renderHook(() => useKeyboardLayoutMap());
		const second = renderHook(() => useKeyboardLayoutMap());
		await act(async () => {});

		// Assert

		expect(getLayoutMap).toHaveBeenCalledTimes(1);
		expect(first.result.current?.get("KeyK")).toBe("k");
		expect(second.result.current?.get("KeyK")).toBe("k");
	});

	it("Should keep the same map when refocusing finds the same layout", async () => {
		// Arrange

		const useKeyboardLayoutMap = await importHook();
		const { result } = renderHook(() => useKeyboardLayoutMap());
		await act(async () => {});
		const before = result.current;

		// Act

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		// Assert

		expect(getLayoutMap).toHaveBeenCalledTimes(2);
		expect(result.current).toBe(before);
	});

	it("Should update when refocusing finds another layout", async () => {
		// Arrange

		const useKeyboardLayoutMap = await importHook();
		const { result } = renderHook(() => useKeyboardLayoutMap());
		await act(async () => {});
		getLayoutMap.mockResolvedValue(new Map([["KeyK", "к"]]));

		// Act

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		// Assert

		expect(result.current?.get("KeyK")).toBe("к");
	});
});
