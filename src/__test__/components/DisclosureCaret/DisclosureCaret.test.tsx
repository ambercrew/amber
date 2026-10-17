import DisclosureCaret from "../../../components/DisclosureCaret/DisclosureCaret";
import { renderWithProviders } from "../../test-utils/renderWithProviders";
import { MOTION_DURATION_MS } from "../../../config/motion";

function caret(container: HTMLElement) {
	const svg = container.querySelector("svg");
	if (!svg) throw new Error("Caret not found");
	return svg;
}

describe("DisclosureCaret", () => {
	it("Should point down when its section is opened", () => {
		// Arrange & Act

		const { container } = renderWithProviders(<DisclosureCaret opened />);

		// Assert

		expect(caret(container)).toHaveStyle({ transform: "rotate(90deg)" });
	});

	it("Should point right and animate with the app's motion duration when its section is closed", () => {
		// Arrange & Act

		const { container } = renderWithProviders(
			<DisclosureCaret opened={false} />,
		);

		// Assert

		expect(caret(container).style.transform).toBe("");
		expect(caret(container)).toHaveStyle({
			transition: `transform ${MOTION_DURATION_MS}ms ease`,
		});
	});
});
