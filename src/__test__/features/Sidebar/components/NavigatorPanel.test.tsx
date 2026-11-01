import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NavigatorPanel from "../../../../features/Sidebar/components/NavigatorPanel";
import { ElementTreeState } from "../../../../features/Sidebar/hooks/useElementTreeState";
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

		vi.mocked(createFolderAction).mockReturnValue(() =>
			Promise.resolve(true),
		);
		const user = userEvent.setup();
		renderWithProviders(
			<NavigatorPanel treeState={{} as ElementTreeState} />,
		);

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

	it("Should leave the name for the backend to derive when clicked", async () => {
		// Arrange

		vi.mocked(createFolderAction).mockReturnValue(() =>
			Promise.resolve(true),
		);
		const user = userEvent.setup();
		renderWithProviders(
			<NavigatorPanel treeState={{} as ElementTreeState} />,
		);

		// Act

		await user.click(screen.getByRole("button", { name: "New element" }));
		await user.click(await screen.findByText("Folder"));

		// Assert

		expect(createFolderAction).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({ name: null }) as object,
			}),
		);
	});
});
