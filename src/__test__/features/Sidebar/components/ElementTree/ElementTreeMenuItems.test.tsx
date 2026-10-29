import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu } from "@mantine/core";
import ElementTreeMenuItems from "../../../../../features/Sidebar/components/ElementTree/ElementTreeMenuItems";
import { ElementId } from "../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";
import { getDueElements } from "../../../../../api/study/api/studyApi";
import { DueElementDto } from "../../../../../api/study/dto/dueElementDto";

vi.mock(import("../../../../../api/study/api/studyApi"));
vi.mock(import("../../../../../api/elements/api/elementsApi"));

function render(elementId: ElementId) {
	return renderWithProviders(
		<Menu opened>
			<Menu.Target>
				<button type="button">Target</button>
			</Menu.Target>
			<Menu.Dropdown>
				<ElementTreeMenuItems
					elementId={elementId}
					onRenameClick={vi.fn()}
					onTrashClick={vi.fn()}
					onAfterCreate={vi.fn()}
				/>
			</Menu.Dropdown>
		</Menu>,
	);
}

describe("ElementTreeMenuItems", () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.mocked(getDueElements).mockResolvedValue([]);
	});

	it("Should scope study to the folder and its contents when scope study to this folder is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const folder: ElementId = { type: "folder", id: "folder-1" };
		const { store } = render(folder);

		// Act

		await user.click(
			screen.getByRole("menuitem", {
				name: "Scope study to this folder",
			}),
		);

		// Assert

		expect(store.getState().study.studyScope).toEqual({
			type: "custom",
			filters: [
				expect.objectContaining({
					field: "descendantOf",
					operator: "isOrSelf",
					ancestor: folder,
				}),
			],
		});
	});

	it("Should name the element's type in the scope item when the element is not a folder", () => {
		// Arrange, Act

		render({ type: "learningAsset", id: "asset-1" });

		// Assert

		expect(
			screen.getByRole("menuitem", {
				name: "Scope study to this learning asset",
			}),
		).toBeInTheDocument();
	});

	it("Should remember the scope as a recent query when scope study is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const folder: ElementId = { type: "folder", id: "folder-1" };
		render(folder);

		// Act

		await user.click(
			screen.getByRole("menuitem", {
				name: "Scope study to this folder",
			}),
		);

		// Assert

		const stored = JSON.parse(
			window.localStorage.getItem("study.recent-custom-queries") ?? "[]",
		) as unknown[][];
		expect(stored).toEqual([
			[
				expect.objectContaining({
					field: "descendantOf",
					ancestor: folder,
				}),
			],
		]);
	});

	it("Should start a study session within the new scope when scope study is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const folder: ElementId = { type: "folder", id: "folder-1" };
		const due: DueElementDto[] = [
			{ elementId: { type: "card", id: "card-1" }, title: "Card 1" },
		];
		vi.mocked(getDueElements).mockResolvedValue(due);
		const { store } = render(folder);

		// Act

		await user.click(
			screen.getByRole("menuitem", {
				name: "Scope study to this folder",
			}),
		);

		// Assert

		expect(getDueElements).toHaveBeenCalledWith(
			store.getState().study.studyScope,
		);
		await waitFor(() => {
			expect(store.getState().study.status).toBe("studying");
		});
	});
});
