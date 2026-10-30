import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElementStatusControl from "../../../../features/Study/components/ElementStatusControl";
import { setElementsStatus } from "../../../../api/study/api/studyApi";
import { ElementId } from "../../../../types/elements/elementId";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/study/api/studyApi"));

const CARD_ID: ElementId = { type: "card", id: "card-1" };

describe("ElementStatusControl", () => {
	it("Should offer only active and suspended when given a card", () => {
		// Arrange, Act

		renderWithProviders(
			<ElementStatusControl elementId={CARD_ID} status="active" />,
		);

		// Assert

		expect(screen.getByRole("radio", { name: "Active" })).toBeChecked();
		expect(
			screen.getByRole("radio", { name: "Suspended" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("radio", { name: "Finished" }),
		).not.toBeInTheDocument();
	});

	it("Should revert to the previous status when setting it fails", async () => {
		// Arrange

		vi.mocked(setElementsStatus).mockRejectedValueOnce("Failed");
		const user = userEvent.setup();
		renderWithProviders(
			<ElementStatusControl elementId={CARD_ID} status="active" />,
		);

		// Act

		await user.click(screen.getByRole("radio", { name: "Suspended" }));

		// Assert

		await waitFor(() =>
			expect(screen.getByRole("radio", { name: "Active" })).toBeChecked(),
		);
		expect(setElementsStatus).toHaveBeenCalledWith([CARD_ID], "suspended");
	});
});
