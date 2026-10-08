import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createEditor } from "lexical";
import RemoveHighlightModal from "../../../features/ElementViewer/RemoveHighlightModal";
import { PendingHighlightRemoval } from "../../../features/ElementViewer/hooks/useElementViewerButtons";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

function makeRemoval(count: number): PendingHighlightRemoval {
	return {
		editor: createEditor(),
		highlightIds: Array.from({ length: count }, (_, i) => `id-${i}`),
		elementIds: Array.from({ length: count }, (_, i) => ({
			type: "extract" as const,
			id: `id-${i}`,
		})),
	};
}

describe("RemoveHighlightModal", () => {
	it("Should state a single element when one element will be trashed", () => {
		// Arrange

		const removal = makeRemoval(1);

		// Act

		renderWithProviders(
			<RemoveHighlightModal
				removal={removal}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// Assert

		expect(
			screen.getByText(/1 element created from this highlight/),
		).toBeInTheDocument();
	});

	it("Should state the element count when several elements will be trashed", () => {
		// Arrange

		const removal = makeRemoval(3);

		// Act

		renderWithProviders(
			<RemoveHighlightModal
				removal={removal}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// Assert

		expect(
			screen.getByText(/3 elements created from these highlights/),
		).toBeInTheDocument();
	});

	it("Should confirm and close when Remove is clicked", async () => {
		// Arrange

		const onConfirm = vi.fn();
		const onClose = vi.fn();
		renderWithProviders(
			<RemoveHighlightModal
				removal={makeRemoval(1)}
				onConfirm={onConfirm}
				onClose={onClose}
			/>,
		);

		// Act

		await userEvent.click(screen.getByRole("button", { name: "Remove" }));

		// Assert

		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onClose).toHaveBeenCalledOnce();
	});
});
