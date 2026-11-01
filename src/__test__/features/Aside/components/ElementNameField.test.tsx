import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElementNameField from "../../../../features/Aside/components/ElementNameField";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { setElementNameSource } from "../../../../api/elements/api/elementsApi";
import { ElementId } from "../../../../types/elements/elementId";
import { NameSource } from "../../../../types/elements/nameSource";

vi.mock(import("../../../../api/elements/api/elementsApi"));

const ELEMENT_ID: ElementId = { type: "extract", id: "extract-1" };

function renderField(nameSource: NameSource) {
	return renderWithProviders(
		<ElementNameField
			elementId={ELEMENT_ID}
			name="Cell biology"
			nameSource={nameSource}
		/>,
	);
}

describe("ElementNameField", () => {
	it("Should show the name input when the name is manual", () => {
		// Arrange, Act

		renderField("manual");

		// Assert

		expect(screen.getByLabelText("Name")).toHaveValue("Cell biology");
	});

	it("Should show the name as a placeholder with an auto tag when the name is automatic", () => {
		// Arrange, Act

		renderField("automatic");

		// Assert

		const input = screen.getByLabelText("Name");
		expect(input).toHaveValue("");
		expect(input).toHaveAttribute("placeholder", "Cell biology");
		expect(screen.getByText("Auto")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Reset to automatic name" }),
		).not.toBeInTheDocument();
	});

	it("Should make the name automatic and clear the input when reset is clicked", async () => {
		// Arrange

		vi.mocked(setElementNameSource).mockResolvedValue(undefined);
		const user = userEvent.setup();
		renderField("manual");

		// Act

		await user.click(
			screen.getByRole("button", { name: "Reset to automatic name" }),
		);

		// Assert

		await waitFor(() =>
			expect(setElementNameSource).toHaveBeenCalledWith(
				ELEMENT_ID,
				"automatic",
			),
		);
		expect(screen.getByLabelText("Name")).toHaveValue("");
		expect(screen.getByText("Auto")).toBeInTheDocument();
	});
});
