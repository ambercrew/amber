import { renderHook } from "@testing-library/react";
import { useShortcutDisplay } from "../../commands/useShortcutDisplay";
import { useIsCoarsePointer } from "../../hooks/useIsCoarsePointer";

vi.mock(import("../../hooks/useIsCoarsePointer"));

describe("useShortcutDisplay", () => {
	it("Should format the shortcut when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		const { result } = renderHook(() => useShortcutDisplay());

		// Assert

		expect(result.current("mod+K")).toBe("Ctrl + K");
	});

	it("Should yield nothing when the pointer is coarse", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);

		// Act

		const { result } = renderHook(() => useShortcutDisplay());

		// Assert

		expect(result.current("mod+K")).toBeUndefined();
	});

	it("Should yield nothing when there is no shortcut", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		const { result } = renderHook(() => useShortcutDisplay());

		// Assert

		expect(result.current(undefined)).toBeUndefined();
	});
});
