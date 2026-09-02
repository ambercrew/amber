import { fireEvent, screen } from "@testing-library/react";
import ImportPdfExtractionSection from "../../../../features/Import/components/ImportPdfExtractionSection";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

describe("ImportPdfExtractionSection", () => {
	it("Should render unchecked when extract is false", () => {
		// Arrange

		// Act

		renderWithProviders(
			<ImportPdfExtractionSection
				isPdf
				extract={false}
				onExtractChange={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByText("Import options"));

		// Assert

		expect(screen.getByLabelText("Extract content")).not.toBeChecked();
	});

	it("Should call onExtractChange when toggled", () => {
		// Arrange

		const onExtractChange = vi.fn();
		renderWithProviders(
			<ImportPdfExtractionSection
				isPdf
				extract={false}
				onExtractChange={onExtractChange}
			/>,
		);
		fireEvent.click(screen.getByText("Import options"));

		// Act

		fireEvent.click(screen.getByLabelText("Extract content"));

		// Assert

		expect(onExtractChange).toHaveBeenCalledWith(true);
	});

	it("Should show a fallback message when isPdf is false", async () => {
		// Arrange

		renderWithProviders(
			<ImportPdfExtractionSection
				isPdf={false}
				extract={false}
				onExtractChange={vi.fn()}
			/>,
		);

		// Act

		fireEvent.click(screen.getByText("Import options"));

		// Assert

		expect(
			await screen.findByText("No options for this file."),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Extract content"),
		).not.toBeInTheDocument();
	});
});
