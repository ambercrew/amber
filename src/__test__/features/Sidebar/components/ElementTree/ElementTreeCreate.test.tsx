import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeDto } from "../../../../../api/elements/dto/nodeDto";
import ElementTreeHarness from "../../../../test-utils/ElementTreeHarness";
import {
	createExtractAction,
	createFolderAction,
} from "../../../../../stores/elements/elementsActions";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../stores/elements/elementsActions"));
vi.mock(
	import("../../../../../features/Sidebar/components/TrashElementModal"),
	() => ({ default: () => <></> }),
);
vi.mock(
	import("../../../../../features/Sidebar/components/ElementTree/RenameElementForm"),
	() => ({ default: () => <></> }),
);

const TREE: NodeDto[] = [
	{
		meta: {
			elementId: { type: "folder", id: "folder-science" },
			name: "Science",
			position: "0",
		},
		children: {
			folders: [],
			learningAssets: [
				{
					meta: {
						elementId: {
							type: "learningAsset",
							id: "learningAsset-biology",
						},
						name: "Biology Basics",
						position: "0",
					},
					children: {
						folders: [],
						learningAssets: [],
						extracts: [],
						cards: [],
					},
				},
			],
			extracts: [],
			cards: [],
		},
	},
];

describe("ElementTree create child", () => {
	beforeEach(() => window.localStorage.clear());

	function render() {
		return renderWithProviders(<ElementTreeHarness tree={TREE} />);
	}

	it("Should dispatch createFolderAction with the parent folder id when Folder is clicked", async () => {
		// Arrange

		vi.mocked(createFolderAction).mockReturnValue(() =>
			Promise.resolve(true),
		);

		const user = userEvent.setup();
		render();

		// Act — right-click Science to open the context menu, then navigate New > Folder

		await user.pointer({
			target: screen.getByLabelText("Science"),
			keys: "[MouseRight]",
		});
		await waitFor(
			() => expect(screen.getByText("New")).toBeInTheDocument(),
			{ timeout: 2000 },
		);
		await user.hover(screen.getByText("New"));
		await waitFor(() => screen.getByText("Folder"), { timeout: 1000 });
		await user.click(screen.getByText("Folder"));

		// Assert

		expect(createFolderAction).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({
					parent: { type: "folder", id: "folder-science" },
				}) as object,
			}),
		);
	});

	it("Should dispatch createExtractAction with the learning asset as parent when Extract is clicked", async () => {
		// Arrange

		vi.mocked(createExtractAction).mockReturnValue(() =>
			Promise.resolve(true),
		);

		const user = userEvent.setup();
		render();

		// Expand Science to reveal Biology Basics, then right-click it

		await user.click(screen.getByRole("button", { name: "Expand" }));
		await user.pointer({
			target: screen.getByLabelText("Biology Basics"),
			keys: "[MouseRight]",
		});
		await waitFor(
			() => expect(screen.getByText("New")).toBeInTheDocument(),
			{ timeout: 2000 },
		);
		await user.hover(screen.getByText("New"));
		await waitFor(() => screen.getByText("Extract"), { timeout: 1000 });
		await user.click(screen.getByText("Extract"));

		// Assert

		expect(createExtractAction).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({
					parent: {
						type: "learningAsset",
						id: "learningAsset-biology",
					},
				}) as object,
			}),
		);
	});

	it("Should use a name containing the element label and a timestamp when creating", async () => {
		// Arrange

		vi.mocked(createFolderAction).mockReturnValue(() =>
			Promise.resolve(true),
		);

		const user = userEvent.setup();
		render();

		// Act

		await user.pointer({
			target: screen.getByLabelText("Science"),
			keys: "[MouseRight]",
		});
		await waitFor(
			() => expect(screen.getByText("New")).toBeInTheDocument(),
			{ timeout: 2000 },
		);
		await user.hover(screen.getByText("New"));
		await waitFor(() => screen.getByText("Folder"), { timeout: 1000 });
		await user.click(screen.getByText("Folder"));

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

	it("Should expand the parent node after a child is created via the context menu", async () => {
		// Arrange

		vi.mocked(createFolderAction).mockReturnValue(() =>
			Promise.resolve(true),
		);

		const user = userEvent.setup();
		render();

		// Science is collapsed by default — Biology Basics is not visible.
		expect(screen.queryByLabelText("Biology Basics")).toBeNull();

		// Act — right-click Science to open the context menu, then create a child folder

		await user.pointer({
			target: screen.getByLabelText("Science"),
			keys: "[MouseRight]",
		});
		await waitFor(
			() => expect(screen.getByText("New")).toBeInTheDocument(),
			{ timeout: 2000 },
		);
		await user.hover(screen.getByText("New"));
		await waitFor(() => screen.getByText("Folder"), { timeout: 1000 });
		await user.click(screen.getByText("Folder"));

		// Assert — Science is now expanded, revealing Biology Basics.

		await waitFor(() => {
			expect(screen.getByLabelText("Biology Basics")).toBeInTheDocument();
		});
	});
});
