import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StageCapability } from "@embedpdf/react/stage";
import { usePdfNavigator } from "../../../../../features/ElementViewer/PdfView/core/usePdfNavigator";

/** A stand-in for the Stage that records the jumps asked of it. */
function createFakeStage() {
	const goToPage = vi.fn();
	return { stage: { goToPage } as unknown as StageCapability, goToPage };
}

describe("usePdfNavigator", () => {
	it("Should go smoothly to the page's 0-based index when no behavior is given", () => {
		// Arrange

		const { stage, goToPage } = createFakeStage();
		const { result } = renderHook(() => usePdfNavigator(stage));

		// Act

		act(() => result.current.goToPage(5));

		// Assert

		expect(goToPage).toHaveBeenCalledWith(4, { behavior: "smooth" });
	});

	it("Should pass the behavior on when one is given", () => {
		// Arrange

		const { stage, goToPage } = createFakeStage();
		const { result } = renderHook(() => usePdfNavigator(stage));

		// Act

		act(() => result.current.goToPage(2, { behavior: "instant" }));

		// Assert

		expect(goToPage).toHaveBeenCalledWith(1, { behavior: "instant" });
	});

	it("Should request the header to hide when jumping", () => {
		// Arrange

		const { stage } = createFakeStage();
		const { result } = renderHook(() => usePdfNavigator(stage));

		// Act

		act(() => result.current.goToPage(5));

		// Assert

		expect(result.current.hideRequests).toBe(1);
	});

	it("Should request the header to hide when a jump made elsewhere is announced", () => {
		// Arrange

		const { stage, goToPage } = createFakeStage();
		const { result } = renderHook(() => usePdfNavigator(stage));

		// Act

		act(() => result.current.announceJump());

		// Assert

		expect(result.current.hideRequests).toBe(1);
		expect(goToPage).not.toHaveBeenCalled();
	});
});
