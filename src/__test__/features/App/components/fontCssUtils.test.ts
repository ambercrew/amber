import { fontToCssFamily } from "../../../../features/App/components/fontCssUtils";

describe("fontToCssFamily", () => {
	it("Should return null when font is systemDefault", () => {
		// Arrange

		const font = { type: "systemDefault" as const };

		// Act

		const actual = fontToCssFamily(font);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return a quoted font-family value when font is named", () => {
		// Arrange

		const font = { type: "named" as const, value: "Arial" };

		// Act

		const actual = fontToCssFamily(font);

		// Assert

		expect(actual).toBe('"Arial"');
	});
});
