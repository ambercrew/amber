import {
	decodeEquation,
	encodeEquation,
} from "../../../../components/Editor/plugins/EquationPlugin/equationElement";

describe("equationElement", () => {
	it("Should round-trip the equation when it contains non-Latin1 characters", () => {
		// Arrange

		const equation = "α + β = γ → ∞";

		// Act

		const actual = decodeEquation(encodeEquation(equation));

		// Assert

		expect(actual).toBe(equation);
	});

	it("Should decode the equation when it was encoded with plain btoa", () => {
		// Arrange

		const encoded = btoa("\\frac{1}{2} °");

		// Act

		const actual = decodeEquation(encoded);

		// Assert

		expect(actual).toBe("\\frac{1}{2} °");
	});
});
