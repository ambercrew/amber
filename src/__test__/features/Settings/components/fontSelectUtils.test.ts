import {
	SYSTEM_DEFAULT_FONT_VALUE,
	fontToSelectValue,
	selectValueToFont,
} from "../../../../features/Settings/components/fontSelectUtils";

describe("fontToSelectValue", () => {
	it("Should return the system default sentinel when font is systemDefault", () => {
		// Arrange

		const font = { type: "systemDefault" as const };

		// Act

		const actual = fontToSelectValue(font);

		// Assert

		expect(actual).toBe(SYSTEM_DEFAULT_FONT_VALUE);
	});

	it("Should return the font family name when font is named", () => {
		// Arrange

		const font = { type: "named" as const, value: "Arial" };

		// Act

		const actual = fontToSelectValue(font);

		// Assert

		expect(actual).toBe("Arial");
	});
});

describe("selectValueToFont", () => {
	it("Should return a systemDefault font when value is the system default sentinel", () => {
		// Act

		const actual = selectValueToFont(SYSTEM_DEFAULT_FONT_VALUE);

		// Assert

		expect(actual).toEqual({ type: "systemDefault" });
	});

	it("Should return a named font when value is a font family name", () => {
		// Act

		const actual = selectValueToFont("Arial");

		// Assert

		expect(actual).toEqual({ type: "named", value: "Arial" });
	});
});
