import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NavigatorPanel from "../../../../features/Sidebar/components/NavigatorPanel";
import { createFolderAction } from "../../../../stores/elements/elementsActions";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../stores/elements/elementsActions"));
vi.mock(
	import("../../../../features/Sidebar/components/ElementTree/ElementTree"),
	() => ({ default: () => <></> }),
);

describe("NavigatorPanel — new root folder button", () => {
	it("Should dispatch createFolderAction with parentFolderId null when clicked", async () => {
		// Arrange

		vi.mocked(createFolderAction).mockReturnValue(() => Promise.resolve());
		const user = userEvent.setup();
		renderWithProviders(<NavigatorPanel />);

		// Act

		await user.click(screen.getByRole("button", { name: "New element" }));
		await user.click(await screen.findByText("Folder"));

		// Assert

		expect(createFolderAction).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({ parent: null }) as object,
			}),
		);
	});

	it("Should use a name containing the element label and a timestamp when clicked", async () => {
		// Arrange

		vi.mocked(createFolderAction).mockReturnValue(() => Promise.resolve());
		const user = userEvent.setup();
		renderWithProviders(<NavigatorPanel />);

		// Act

		await user.click(screen.getByRole("button", { name: "New element" }));
		await user.click(await screen.findByText("Folder"));

		// Assert — name is "Folder YYYY-MM-DD HH:MM:SS"

		expect(createFolderAction).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({
					name: expect.stringMatching(
						/^Folder \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
					) as string,
				}) as object,
			}),
		);
	});
});
