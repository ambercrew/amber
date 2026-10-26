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

	it("Should hide the name input when the name is automatic", () => {
		// Arrange, Act

		renderField("automatic");

		// Assert

		expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
	});

	it("Should make the name automatic and hide the name input when automatic is chosen", async () => {
		// Arrange

		vi.mocked(setElementNameSource).mockResolvedValue(undefined);
		const user = userEvent.setup();
		renderField("manual");

		// Act

		await user.click(screen.getByRole("combobox", { name: "Name source" }));
		await user.click(
			await screen.findByRole("option", { name: "Automatic" }),
		);

		// Assert

		await waitFor(() =>
			expect(setElementNameSource).toHaveBeenCalledWith(
				ELEMENT_ID,
				"automatic",
			),
		);
		expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
	});
});
