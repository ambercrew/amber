import { describe, expect, it } from "vitest";
import { chromeInsets } from "../../../../features/App/context/chromeInsetsContext";

describe("chromeInsets", () => {
	it("Should stay clear of the header and footer when both are shown", () => {
		// Act

		const actual = chromeInsets(true, true, "8px");

		// Assert

		expect(actual.top).toBe("var(--app-shell-header-height, 0px)");
		expect(actual.bottom).toBe(
			"calc(var(--app-shell-footer-height, 0px) + 8px)",
		);
	});

	it("Should reach the screen's edges, keeping only the safe area, when the header and footer are hidden", () => {
		// Act

		const actual = chromeInsets(false, false, "8px");

		// Assert

		expect(actual.top).toBe("0px");
		expect(actual.bottom).toBe("calc(0px + 8px)");
	});

	it("Should animate both edges with the app shell's own transition", () => {
		// Act

		const actual = chromeInsets(true, false, "0px");

		// Assert

		expect(actual.transition).toContain(
			"top var(--app-shell-transition-duration)",
		);
		expect(actual.transition).toContain(
			"bottom var(--app-shell-transition-duration)",
		);
	});
});
