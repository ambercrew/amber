import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeDto } from "../../../../../api/elements/dto/nodeDto";
import ElementTreeHarness from "../../../../test-utils/ElementTreeHarness";
import { useIsCoarsePointer } from "../../../../../hooks/useIsCoarsePointer";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../hooks/useIsCoarsePointer"));

const TREE: NodeDto[] = [
	{
		meta: {
			elementId: { type: "folder", id: "folder-science" },
			name: "Science",
			position: "0",
		},
		children: { folders: [], learningAssets: [], extracts: [], cards: [] },
	},
];

describe("ElementTreeNode actions menu", () => {
	beforeEach(() => window.localStorage.clear());

	function renderMenuButton() {
		renderWithProviders(<ElementTreeHarness tree={TREE} />);
		return screen.getByLabelText("Open actions menu");
	}

	it("Should show the actions menu when the pointer is coarse", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);

		// Act

		const actual = renderMenuButton();

		// Assert

		expect(actual.style.visibility).toBe("visible");
	});

	it("Should hide the actions menu until hovered when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		const actual = renderMenuButton();

		// Assert

		expect(actual.style.visibility).toBe("hidden");
	});

	it("Should open the actions when the menu button is clicked", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
		const user = userEvent.setup();
		const button = renderMenuButton();

		// Act

		await user.click(button);

		// Assert

		expect(await screen.findByText("New")).toBeInTheDocument();
	});

	it("Should open the actions again when the menu is reopened after closing", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
		const user = userEvent.setup();
		await user.click(renderMenuButton());
		await screen.findByText("New");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByText("New")).toBeNull());

		// Act

		await user.click(screen.getByLabelText("Open actions menu"));

		// Assert

		expect(await screen.findByText("New")).toBeInTheDocument();
	});

	it("Should focus the menu button again when the menu is closed with the keyboard", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
		const user = userEvent.setup();
		const button = renderMenuButton();
		act(() => button.focus());
		await user.keyboard("{Enter}");
		await screen.findByText("New");

		// Act

		await user.keyboard("{Escape}");

		// Assert

		await waitFor(() =>
			expect(screen.getByLabelText("Open actions menu")).toHaveFocus(),
		);
	});

	it("Should tab from a row to its menu button and then out of the tree", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);
		const user = userEvent.setup();
		renderWithProviders(
			<>
				<ElementTreeHarness tree={TREE} />
				<button type="button">After</button>
			</>,
		);
		act(() => screen.getByRole("treeitem").focus());

		// Act

		await user.tab();
		const menuButton = document.activeElement;
		await user.tab();

		// Assert

		expect([menuButton, document.activeElement]).toEqual([
			screen.getByLabelText("Open actions menu"),
			screen.getByText("After"),
		]);
	});

	it("Should open the actions when Space is pressed on the menu button", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);
		const user = userEvent.setup();
		renderWithProviders(<ElementTreeHarness tree={TREE} />);
		act(() => screen.getByRole("treeitem").focus());
		await user.tab();

		// Act

		await user.keyboard(" ");

		// Assert

		expect(await screen.findByText("New")).toBeInTheDocument();
	});

	it("Should leave the actions unfocused when the menu is opened by clicking", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
		const user = userEvent.setup();
		const button = renderMenuButton();

		// Act

		await user.click(button);
		await screen.findByText("New");
		await act(() => new Promise(resolve => setTimeout(resolve, 50)));

		// Assert

		expect(document.activeElement?.getAttribute("role")).not.toBe(
			"menuitem",
		);
	});

	it("Should move through the actions when an arrow key is pressed in the open menu", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
		const user = userEvent.setup();
		const second = {
			...TREE[0],
			meta: {
				...TREE[0].meta,
				elementId: { type: "folder" as const, id: "folder-art" },
				name: "Art",
				position: "1",
			},
		};
		renderWithProviders(<ElementTreeHarness tree={[...TREE, second]} />);
		act(() => screen.getAllByLabelText("Open actions menu")[0].focus());
		await user.keyboard("{Enter}");
		await screen.findByText("New");

		// Act

		await user.keyboard("{ArrowDown}");

		// Assert

		expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
	});
});
