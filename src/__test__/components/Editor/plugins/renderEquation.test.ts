import { renderToString } from "katex";
import { renderEquation } from "../../../../components/Editor/plugins/EquationPlugin/renderEquation";

vi.mock(import("katex"), async importOriginal => ({
	...(await importOriginal()),
	renderToString: vi.fn(),
}));

describe("renderEquation", () => {
	it("Should escape the equation when KaTeX throws", () => {
		// Arrange

		vi.mocked(renderToString).mockImplementation(() => {
			throw new Error("internal");
		});

		// Act

		const actual = renderEquation('<img src=x onerror="alert(1)">', false);

		// Assert

		expect(actual).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
	});

	it("Should render once when the same equation is rendered again", () => {
		// Arrange

		vi.mocked(renderToString).mockReset().mockReturnValue("<span>x</span>");
		renderEquation("x^2", true);

		// Act

		const actual = renderEquation("x^2", true);

		// Assert

		expect(actual).toBe("<span>x</span>");
		expect(renderToString).toHaveBeenCalledTimes(1);
	});
});
