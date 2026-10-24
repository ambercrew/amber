import { Menu } from "@mantine/core";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PluginContextMenuItems } from "../../../../../features/ElementViewer/LearningAssetView/plugins/PluginHost";
import { LearningAssetPlugin } from "../../../../../features/ElementViewer/LearningAssetView/plugins/types";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

function plugin(id: string, contextMenuOrder?: number): LearningAssetPlugin {
	return {
		id,
		ContextMenuItems: () => <Menu.Item>{id}</Menu.Item>,
		contextMenuOrder,
	};
}

describe("PluginContextMenuItems", () => {
	it("Should order sections by contextMenuOrder, then list order, when plugins set it", () => {
		// Arrange

		const plugins = [
			plugin("read-point"),
			{ id: "no-menu" },
			plugin("marks", -1),
			plugin("other"),
		];

		// Act

		renderWithProviders(
			<Menu opened>
				<Menu.Target>
					<button type="button">open</button>
				</Menu.Target>
				<Menu.Dropdown>
					<PluginContextMenuItems plugins={plugins} />
				</Menu.Dropdown>
			</Menu>,
		);

		// Assert

		const items = screen
			.getAllByRole("menuitem")
			.map(item => item.textContent);
		expect(items).toEqual(["marks", "read-point", "other"]);
		expect(document.querySelectorAll(".mantine-Menu-divider")).toHaveLength(
			2,
		);
	});
});
