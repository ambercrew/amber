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
				position={5}
				onPositionChange={vi.fn()}
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
				position={null}
				onPositionChange={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByText("Priority"));

		// Assert

		expect(screen.queryByLabelText("Position")).not.toBeInTheDocument();
	});

	it("Should show the slider at the given position once expanded", async () => {
		// Arrange

		renderWithProviders(
			<ImportPrioritySection
				total={10}
				position={5}
				onPositionChange={vi.fn()}
			/>,
		);

		// Act

		fireEvent.click(screen.getByText("Priority"));

		// Assert

		expect(await screen.findByDisplayValue("44.44%")).toBeInTheDocument();
		expect(screen.getByDisplayValue("5")).toBeInTheDocument();
		expect(screen.getByText("Position 5 of 10")).toBeInTheDocument();
	});

	it("Should report the new position when the position input changes", async () => {
		// Arrange

		const onPositionChange = vi.fn();
		renderWithProviders(
			<ImportPrioritySection
				total={10}
				position={5}
				onPositionChange={onPositionChange}
			/>,
		);
		fireEvent.click(screen.getByText("Priority"));
		const positionInput = await screen.findByLabelText("Position");

		// Act

		fireEvent.change(positionInput, { target: { value: "1" } });

		// Assert

		await waitFor(() => expect(onPositionChange).toHaveBeenCalledWith(1));
	});

	it("Should report the equivalent position when the percentile input changes", async () => {
		// Arrange

		const onPositionChange = vi.fn();
		renderWithProviders(
			<ImportPrioritySection
				total={10}
				position={5}
				onPositionChange={onPositionChange}
			/>,
		);
		fireEvent.click(screen.getByText("Priority"));
		const percentileInput = await screen.findByLabelText("Percentile");

		// Act

		fireEvent.change(percentileInput, { target: { value: "0%" } });

		// Assert

		await waitFor(() => expect(onPositionChange).toHaveBeenCalledWith(1));
	});
});
