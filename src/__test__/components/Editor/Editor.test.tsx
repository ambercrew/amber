import { screen } from "@testing-library/react";
import Editor from "../../../components/Editor/Editor";
import { setupStore } from "../../../stores/store";
import { renderWithProviders } from "../../test-utils/renderWithProviders";
import { useIsCoarsePointer } from "../../../hooks/useIsCoarsePointer";

vi.mock(import("../../../hooks/useIsCoarsePointer"), () => ({
	useIsCoarsePointer: vi.fn().mockReturnValue(true),
}));

function renderEditor(virtualKeyboardSuppressed: boolean) {
	renderWithProviders(<Editor />, {
		preloadedState: {
			app: {
				...setupStore().getState().app,
				virtualKeyboardSuppressed,
			},
		},
	});
	return screen.getByLabelText("Rich text editor");
}

describe("Editor", () => {
	beforeEach(() => {
		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
	});

	it("Should not ask for the on-screen keyboard when it is suppressed", () => {
		// Arrange & Act

		const contentEditable = renderEditor(true);

		// Assert

		expect(contentEditable).toHaveAttribute("inputmode", "none");
	});

	it("Should leave the on-screen keyboard alone when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		const contentEditable = renderEditor(true);

		// Assert

		expect(contentEditable).not.toHaveAttribute("inputmode");
	});

	it("Should leave the on-screen keyboard alone when it is not suppressed", () => {
		// Arrange & Act

		const contentEditable = renderEditor(false);

		// Assert

		expect(contentEditable).not.toHaveAttribute("inputmode");
	});
});
