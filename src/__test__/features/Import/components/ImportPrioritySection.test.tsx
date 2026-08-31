import { fireEvent, screen, waitFor } from "@testing-library/react";
import ImportPrioritySection from "../../../../features/Import/components/ImportPrioritySection";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

describe("ImportPrioritySection", () => {
	it("Should keep the slider hidden while collapsed", () => {
		// Arrange

		// Act

		renderWithProviders(
			<ImportPrioritySection
				total={10}
				rank={5}
				onRankChange={vi.fn()}
			/>,
		);

		// Assert

		expect(screen.queryByLabelText("Position")).not.toBeVisible();
	});

	it("Should show a loader instead of the slider while the total is still loading", () => {
		// Arrange

		// Act

		renderWithProviders(
			<ImportPrioritySection
				total={null}
				rank={null}
				onRankChange={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByText("Priority"));

		// Assert

		expect(screen.queryByLabelText("Position")).not.toBeInTheDocument();
	});

	it("Should show the slider at the given rank once expanded", async () => {
		// Arrange

		renderWithProviders(
			<ImportPrioritySection
				total={10}
				rank={5}
				onRankChange={vi.fn()}
			/>,
		);

		// Act

		fireEvent.click(screen.getByText("Priority"));

		// Assert

		expect(await screen.findByDisplayValue("50.00%")).toBeInTheDocument();
		expect(screen.getByDisplayValue("5")).toBeInTheDocument();
		expect(screen.getByText("Rank 5 of 10")).toBeInTheDocument();
	});

	it("Should report the new rank when the position input changes", async () => {
		// Arrange

		const onRankChange = vi.fn();
		renderWithProviders(
			<ImportPrioritySection
				total={10}
				rank={5}
				onRankChange={onRankChange}
			/>,
		);
		fireEvent.click(screen.getByText("Priority"));
		const positionInput = await screen.findByLabelText("Position");

		// Act

		fireEvent.change(positionInput, { target: { value: "1" } });

		// Assert

		await waitFor(() => expect(onRankChange).toHaveBeenCalledWith(1));
	});

	it("Should report the equivalent rank when the percentage input changes", async () => {
		// Arrange

		const onRankChange = vi.fn();
		renderWithProviders(
			<ImportPrioritySection
				total={10}
				rank={5}
				onRankChange={onRankChange}
			/>,
		);
		fireEvent.click(screen.getByText("Priority"));
		const percentageInput = await screen.findByLabelText("Percentage");

		// Act

		fireEvent.change(percentageInput, { target: { value: "0%" } });

		// Assert

		await waitFor(() => expect(onRankChange).toHaveBeenCalledWith(1));
	});
});
