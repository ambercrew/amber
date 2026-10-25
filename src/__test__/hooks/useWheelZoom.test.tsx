import { fireEvent } from "@testing-library/react";
import type { MockInstance } from "vitest";
import { useWheelZoom } from "../../hooks/useWheelZoom";
import { isMobile } from "../../utils/tauriUtils";
import { renderWithProviders } from "../test-utils/renderWithProviders";

vi.mock(import("../../utils/tauriUtils"));

function WheelZoom() {
	useWheelZoom();
	return null;
}

function nonPassiveWheelListenerCount(
	spy: MockInstance<typeof window.addEventListener>,
) {
	return spy.mock.calls.filter(
		([type, , options]) =>
			type === "wheel" &&
			typeof options === "object" &&
			options.passive === false,
	).length;
}

describe("useWheelZoom", () => {
	beforeEach(() => {
		vi.mocked(isMobile).mockReturnValue(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Should not block scrolling with a wheel listener when no modifier is held", () => {
		// Arrange

		const addSpy = vi.spyOn(window, "addEventListener");

		// Act

		renderWithProviders(<WheelZoom />);

		// Assert

		expect(nonPassiveWheelListenerCount(addSpy)).toBe(0);
	});

	it("Should listen for wheel zoom when Ctrl is pressed", () => {
		// Arrange

		const addSpy = vi.spyOn(window, "addEventListener");
		renderWithProviders(<WheelZoom />);

		// Act

		fireEvent.keyDown(window, { key: "Control", ctrlKey: true });

		// Assert

		expect(nonPassiveWheelListenerCount(addSpy)).toBe(1);
	});

	it("Should stop listening for wheel zoom when Ctrl is released", () => {
		// Arrange

		const removeSpy = vi.spyOn(window, "removeEventListener");
		renderWithProviders(<WheelZoom />);
		fireEvent.keyDown(window, { key: "Control", ctrlKey: true });

		// Act

		fireEvent.keyUp(window, { key: "Control", ctrlKey: false });

		// Assert

		expect(removeSpy.mock.calls.some(([type]) => type === "wheel")).toBe(
			true,
		);
	});
});
