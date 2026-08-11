import { Menu } from "@mantine/core";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SavedSearchMenuRow from "../../../../../features/ElementsBrowser/components/SavedSearch/SavedSearchMenuRow";
import { SavedSearchResponseDto } from "../../../../../api/savedSearches/dto/savedSearchResponseDto";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

const SAVED_SEARCH: SavedSearchResponseDto = {
	id: "search-1",
	name: "Math cards",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
};

interface RenderProps {
	selected?: boolean;
}

function renderRow({
	selected = false,
	onSelect = vi.fn(),
	onRename = vi.fn(),
	onDuplicate = vi.fn(),
	onDelete = vi.fn(),
}: RenderProps & {
	onSelect?: () => void;
	onRename?: () => void;
	onDuplicate?: () => void;
	onDelete?: () => void;
} = {}) {
	return renderWithProviders(
		<Menu defaultOpened withinPortal={false}>
			<Menu.Target>
				<button type="button">Open</button>
			</Menu.Target>
			<Menu.Dropdown>
				<SavedSearchMenuRow
					savedSearch={SAVED_SEARCH}
					selected={selected}
					onSelect={onSelect}
					onRename={onRename}
					onDuplicate={onDuplicate}
					onDelete={onDelete}
				/>
			</Menu.Dropdown>
		</Menu>,
	);
}

function render({ selected = false }: RenderProps = {}) {
	const onSelect = vi.fn();
	const onRename = vi.fn();
	const onDuplicate = vi.fn();
	const onDelete = vi.fn();

	renderRow({ selected, onSelect, onRename, onDuplicate, onDelete });

	return { onSelect, onRename, onDuplicate, onDelete };
}

async function openRowActions(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByLabelText(`${SAVED_SEARCH.name} actions`));
}

describe("SavedSearchMenuRow", () => {
	it("Should render the saved search's name", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getByText(SAVED_SEARCH.name)).toBeInTheDocument();
	});

	it("Should show a check indicator when selected is true", () => {
		// Arrange, Act

		const { container } = renderRow({ selected: true });
		const leftSection = container.querySelector('[data-position="left"]');

		// Assert

		expect(leftSection?.querySelector("svg")).toBeInTheDocument();
	});

	it("Should not show a check indicator when selected is false", () => {
		// Arrange

		const { container } = renderRow({ selected: false });

		// Act

		const leftSection = container.querySelector('[data-position="left"]');

		// Assert

		expect(leftSection?.querySelector("svg")).not.toBeInTheDocument();
	});

	it("Should call onSelect when the row is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSelect } = render();

		// Act

		await user.click(screen.getByText(SAVED_SEARCH.name));

		// Assert

		expect(onSelect).toHaveBeenCalled();
	});

	it("Should call onRename when Rename is clicked in the row actions menu", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onRename } = render();

		// Act

		await openRowActions(user);
		await user.click(await screen.findByText("Rename"));

		// Assert

		expect(onRename).toHaveBeenCalled();
	});

	it("Should call onDuplicate when Duplicate is clicked in the row actions menu", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onDuplicate } = render();

		// Act

		await openRowActions(user);
		await user.click(await screen.findByText("Duplicate"));

		// Assert

		expect(onDuplicate).toHaveBeenCalled();
	});

	it("Should call onDelete when Delete is clicked in the row actions menu", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onDelete } = render();

		// Act

		await openRowActions(user);
		await user.click(await screen.findByText("Delete"));

		// Assert

		expect(onDelete).toHaveBeenCalled();
	});
});
