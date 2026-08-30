import { formatShortcut } from "../../commands/formatShortcut";

describe("formatShortcut", () => {
	it("Should use the US-layout letter when no layout map is given", () => {
		// Arrange

		const shortcut = "mod+K";

		// Act

		const actual = formatShortcut(shortcut);

		// Assert

		expect(actual).toContain("K");
	});

	it("Should use the layout map's produced character when the physical key has one", () => {
		// Arrange

		const shortcut = "mod+K";
		const layoutMap = new Map([["KeyK", "л"]]);

		// Act

		const actual = formatShortcut(shortcut, layoutMap);

		// Assert

		expect(actual).toContain("Л");
	});

	it("Should fall back to the US-layout letter when the layout map has no entry for the key", () => {
		// Arrange

		const shortcut = "mod+K";
		const layoutMap = new Map([["KeyN", "т"]]);

		// Act

		const actual = formatShortcut(shortcut, layoutMap);

		// Assert

		expect(actual).toContain("K");
	});

	it("Should not touch special keys such as arrows when a layout map is given", () => {
		// Arrange

		const shortcut = "mod+ArrowUp";
		const layoutMap = new Map([["ArrowUp", "should-not-be-used"]]);

		// Act

		const actual = formatShortcut(shortcut, layoutMap);

		// Assert

		expect(actual).toContain("↑");
	});
});
