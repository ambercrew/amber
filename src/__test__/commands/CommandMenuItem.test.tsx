import { screen } from "@testing-library/react";
import { Menu } from "@mantine/core";
import { CommandMenuItem } from "../../commands/CommandMenuItem";
import { OPEN_SETTINGS_SHORTCUT } from "../../commands/commands";
import { formatShortcut } from "../../commands/formatShortcut";
import { useIsCoarsePointer } from "../../hooks/useIsCoarsePointer";
import { renderWithProviders } from "../test-utils/renderWithProviders";

vi.mock(import("../../hooks/useIsCoarsePointer"));

function renderMenuItem() {
	return renderWithProviders(
		<Menu opened>
			<Menu.Dropdown>
				<CommandMenuItem id="open-settings">Settings</CommandMenuItem>
			</Menu.Dropdown>
		</Menu>,
	);
}

describe("CommandMenuItem", () => {
	it("Should show the command's shortcut when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		renderMenuItem();

		// Assert

		expect(
			screen.getByText(formatShortcut(OPEN_SETTINGS_SHORTCUT)),
		).toBeInTheDocument();
	});

	it("Should show no shortcut when the pointer is coarse", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);

		// Act

		renderMenuItem();

		// Assert

		expect(screen.getByText("Settings")).toBeInTheDocument();
		expect(
			screen.queryByText(formatShortcut(OPEN_SETTINGS_SHORTCUT)),
		).not.toBeInTheDocument();
	});
});
