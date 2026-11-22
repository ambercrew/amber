import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrashedElementDto } from "../../../../api/trash/dto/trashedElementDto";
import TrashPanel from "../../../../features/Sidebar/components/TrashPanel";
import {
	deleteElementPermanentlyAction,
	emptyTrashAction,
	loadTrash,
	restoreElementAction,
} from "../../../../stores/trash/trashActions";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../stores/trash/trashActions"));

const TRASHED_FOLDER: TrashedElementDto = {
	elementId: { type: "folder", id: "folder-science" },
	name: "Science",
	trashedAt: new Date().toISOString(),
	descendantCount: 2,
};

function render(items: TrashedElementDto[]) {
	return renderWithProviders(<TrashPanel />, {
		preloadedState: {
			trash: { items, isLoading: false, error: null },
		},
	});
}

describe("TrashPanel", () => {
	beforeEach(() => {
		vi.mocked(loadTrash).mockReturnValue(() => Promise.resolve());
		vi.mocked(restoreElementAction).mockReturnValue(() =>
			Promise.resolve(),
		);
		vi.mocked(emptyTrashAction).mockReturnValue(() => Promise.resolve());
		vi.mocked(deleteElementPermanentlyAction).mockReturnValue(() =>
			Promise.resolve(),
		);
	});

	it("Should show an empty message when there is nothing in the trash", () => {
		// Arrange

		// Act

		render([]);

		// Assert

		expect(screen.getByText("The trash is empty.")).toBeInTheDocument();
	});

	it("Should list the trashed element when the trash has items", () => {
		// Arrange

		// Act

		render([TRASHED_FOLDER]);

		// Assert

		expect(screen.getByText("Science")).toBeInTheDocument();
	});

	it("Should dispatch restoreElementAction when the restore button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render([TRASHED_FOLDER]);

		// Act

		await user.click(screen.getByRole("button", { name: "Restore" }));

		// Assert

		expect(restoreElementAction).toHaveBeenCalledWith(
			TRASHED_FOLDER.elementId,
		);
	});

	it("Should navigate to the element when the trashed element is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render([TRASHED_FOLDER]);

		// Act

		await user.click(screen.getByText("Science"));

		// Assert

		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"/folder/folder-science",
		);
	});

	/**
	 * The confirmation mounts a transition tick after the click, and "Empty trash" names both the
	 * icon and the confirm button, so wait and stay inside the dialog.
	 */
	async function openedConfirmation() {
		return within(await screen.findByRole("dialog"));
	}

	it("Should dispatch deleteElementPermanentlyAction when the delete is confirmed", async () => {
		// Arrange

		const user = userEvent.setup();
		render([TRASHED_FOLDER]);

		// Act

		await user.click(
			screen.getByRole("button", { name: "Delete permanently" }),
		);
		const confirmation = await openedConfirmation();
		await user.click(confirmation.getByRole("button", { name: "Delete" }));

		// Assert

		expect(deleteElementPermanentlyAction).toHaveBeenCalledWith(
			TRASHED_FOLDER.elementId,
		);
	});

	it("Should not dispatch deleteElementPermanentlyAction when the delete is cancelled", async () => {
		// Arrange

		const user = userEvent.setup();
		render([TRASHED_FOLDER]);

		// Act

		await user.click(
			screen.getByRole("button", { name: "Delete permanently" }),
		);
		const confirmation = await openedConfirmation();
		await user.click(confirmation.getByRole("button", { name: "Cancel" }));

		// Assert

		expect(deleteElementPermanentlyAction).not.toHaveBeenCalled();
	});

	it("Should name the elements going with it when the delete confirmation is shown", async () => {
		// Arrange

		const user = userEvent.setup();
		render([TRASHED_FOLDER]);

		// Act

		await user.click(
			screen.getByRole("button", { name: "Delete permanently" }),
		);

		// Assert

		const confirmation = await openedConfirmation();
		expect(
			confirmation.getByText(
				/Permanently delete "Science" and the 2 elements under it/,
			),
		).toBeInTheDocument();
	});

	it("Should dispatch emptyTrashAction when emptying the trash is confirmed", async () => {
		// Arrange

		const user = userEvent.setup();
		render([TRASHED_FOLDER]);

		// Act

		await user.click(screen.getByRole("button", { name: "Empty trash" }));
		const confirmation = await openedConfirmation();
		await user.click(
			confirmation.getByRole("button", { name: "Empty trash" }),
		);

		// Assert

		expect(emptyTrashAction).toHaveBeenCalledWith([TRASHED_FOLDER]);
	});

	it("Should not navigate when the restore button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render([TRASHED_FOLDER]);

		// Act

		await user.click(screen.getByRole("button", { name: "Restore" }));

		// Assert

		expect(
			screen.getByTestId(LOCATION_DISPLAY_TEST_ID),
		).not.toHaveTextContent("folder-science");
	});
});
