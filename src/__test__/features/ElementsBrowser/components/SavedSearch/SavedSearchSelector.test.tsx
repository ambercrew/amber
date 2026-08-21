import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SavedSearchSelector from "../../../../../features/ElementsBrowser/components/SavedSearch/SavedSearchSelector";
import {
	ElementFilter,
	TagsFilter,
} from "../../../../../api/savedSearches/dto/elementFilter";
import { SavedSearchResponseDto } from "../../../../../api/savedSearches/dto/savedSearchResponseDto";
import { SavedSearchFilterDto } from "../../../../../api/savedSearches/dto/savedSearchFilterDto";
import {
	createSavedSearch,
	deleteSavedSearch,
	duplicateSavedSearch,
	getSavedSearchFilters,
	listSavedSearches,
	renameSavedSearch,
	updateSavedSearchFilters,
} from "../../../../../api/savedSearches/api/savedSearchesApi";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../api/savedSearches/api/savedSearchesApi"));

const TAGS_FILTER: TagsFilter = {
	id: "1",
	field: "tags",
	operator: "isAnyOf",
	tags: ["math"],
};

const SAVED_SEARCH: SavedSearchResponseDto = {
	id: "search-1",
	name: "Math cards",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
};

function filterDtos(filters: ElementFilter[]): SavedSearchFilterDto[] {
	return filters.map((filter, index) => ({ index, filter }));
}

interface RenderProps {
	filters?: ElementFilter[];
	loadedSavedSearchId?: string | null;
	savedSearches?: SavedSearchResponseDto[];
}

function render({
	filters = [],
	loadedSavedSearchId = null,
	savedSearches = [],
}: RenderProps = {}) {
	const onFiltersChange = vi.fn();
	const onLoadedSavedSearchIdChange = vi.fn();
	const onSavedSearchesChange = vi.fn();

	renderWithProviders(
		<SavedSearchSelector
			filters={filters}
			onFiltersChange={onFiltersChange}
			loadedSavedSearchId={loadedSavedSearchId}
			onLoadedSavedSearchIdChange={onLoadedSavedSearchIdChange}
			savedSearches={savedSearches}
			onSavedSearchesChange={onSavedSearchesChange}
		/>,
	);

	return {
		onFiltersChange,
		onLoadedSavedSearchIdChange,
		onSavedSearchesChange,
	};
}

async function openRowActions(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		screen.getByRole("button", { name: /Untitled search|Math cards/ }),
	);
	await user.click(
		await screen.findByLabelText(`${SAVED_SEARCH.name} actions`),
	);
}

describe("SavedSearchSelector", () => {
	beforeEach(() => {
		vi.mocked(listSavedSearches).mockResolvedValue([]);
		vi.mocked(getSavedSearchFilters).mockResolvedValue([]);
		vi.mocked(createSavedSearch).mockResolvedValue(SAVED_SEARCH);
		vi.mocked(renameSavedSearch).mockResolvedValue(SAVED_SEARCH);
		vi.mocked(updateSavedSearchFilters).mockResolvedValue(undefined);
		vi.mocked(duplicateSavedSearch).mockResolvedValue({
			...SAVED_SEARCH,
			id: "search-2",
		});
		vi.mocked(deleteSavedSearch).mockResolvedValue(undefined);
	});

	it('Should show "Untitled search" as the menu label when no saved search is loaded', () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("button", { name: /Untitled search/ }),
		).toBeInTheDocument();
	});

	it("Should show the loaded saved search's name as the menu label when a saved search is loaded", async () => {
		// Arrange, Act

		render({
			loadedSavedSearchId: SAVED_SEARCH.id,
			savedSearches: [SAVED_SEARCH],
		});

		// Assert

		expect(
			screen.getByRole("button", { name: /Math cards/ }),
		).toBeInTheDocument();
		await waitFor(() => expect(getSavedSearchFilters).toHaveBeenCalled());
	});

	it("Should show the Edited badge when live filters differ from the loaded saved search's filters", async () => {
		// Arrange, Act

		render({
			filters: [TAGS_FILTER],
			loadedSavedSearchId: SAVED_SEARCH.id,
			savedSearches: [SAVED_SEARCH],
		});

		// Assert

		expect(await screen.findByText("Edited")).toBeInTheDocument();
	});

	it("Should not show the Edited badge when live filters match the loaded saved search's filters", async () => {
		// Arrange

		vi.mocked(getSavedSearchFilters).mockResolvedValue(
			filterDtos([TAGS_FILTER]),
		);

		// Act

		render({
			filters: [TAGS_FILTER],
			loadedSavedSearchId: SAVED_SEARCH.id,
			savedSearches: [SAVED_SEARCH],
		});
		await waitFor(() => expect(getSavedSearchFilters).toHaveBeenCalled());

		// Assert

		expect(screen.queryByText("Edited")).not.toBeInTheDocument();
	});

	it("Should show only the Save button when no saved search is loaded", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("button", { name: "Save" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Revert" }),
		).not.toBeInTheDocument();
	});

	it("Should show the Save and Revert buttons when the loaded saved search has been edited", async () => {
		// Arrange, Act

		render({
			filters: [TAGS_FILTER],
			loadedSavedSearchId: SAVED_SEARCH.id,
			savedSearches: [SAVED_SEARCH],
		});

		// Assert

		expect(
			await screen.findByRole("button", { name: "Revert" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Save" }),
		).toBeInTheDocument();
	});

	it("Should hide the Save and Revert buttons when the loaded saved search is unedited", async () => {
		// Arrange

		vi.mocked(getSavedSearchFilters).mockResolvedValue(
			filterDtos([TAGS_FILTER]),
		);

		// Act

		render({
			filters: [TAGS_FILTER],
			loadedSavedSearchId: SAVED_SEARCH.id,
			savedSearches: [SAVED_SEARCH],
		});
		await waitFor(() => expect(getSavedSearchFilters).toHaveBeenCalled());

		// Assert

		expect(
			screen.queryByRole("button", { name: "Save" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Revert" }),
		).not.toBeInTheDocument();
	});

	it("Should call onFiltersChange with the loaded filters when Revert is clicked", async () => {
		// Arrange

		vi.mocked(getSavedSearchFilters).mockResolvedValue(
			filterDtos([TAGS_FILTER]),
		);
		const user = userEvent.setup();
		const { onFiltersChange } = render({
			filters: [],
			loadedSavedSearchId: SAVED_SEARCH.id,
			savedSearches: [SAVED_SEARCH],
		});

		// Act

		await user.click(await screen.findByRole("button", { name: "Revert" }));

		// Assert

		expect(onFiltersChange).toHaveBeenCalledWith([TAGS_FILTER]);
	});

	it("Should update the saved search's filters directly when Save is clicked on an edited loaded search", async () => {
		// Arrange

		const user = userEvent.setup();
		render({
			filters: [TAGS_FILTER],
			loadedSavedSearchId: SAVED_SEARCH.id,
			savedSearches: [SAVED_SEARCH],
		});

		// Act

		await user.click(await screen.findByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(updateSavedSearchFilters).toHaveBeenCalledWith(
				SAVED_SEARCH.id,
				{ filters: filterDtos([TAGS_FILTER]) },
			),
		);
	});

	it("Should create a new saved search when Save is clicked and confirmed with no loaded search", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onLoadedSavedSearchIdChange } = render({
			filters: [TAGS_FILTER],
		});

		// Act

		await user.click(screen.getByRole("button", { name: "Save" }));
		const dialog = await screen.findByRole("dialog");
		await user.type(within(dialog).getByRole("textbox"), "New search");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(createSavedSearch).toHaveBeenCalledWith({
				name: "New search",
				filters: filterDtos([TAGS_FILTER]),
			}),
		);
		expect(onLoadedSavedSearchIdChange).toHaveBeenCalledWith(
			SAVED_SEARCH.id,
		);
	});

	it("Should load the selected saved search's filters when a row is selected from the menu", async () => {
		// Arrange

		vi.mocked(getSavedSearchFilters).mockResolvedValue(
			filterDtos([TAGS_FILTER]),
		);
		const user = userEvent.setup();
		const { onLoadedSavedSearchIdChange, onFiltersChange } = render({
			savedSearches: [SAVED_SEARCH],
		});

		// Act

		await user.click(
			screen.getByRole("button", { name: /Untitled search/ }),
		);
		await user.click(await screen.findByText(SAVED_SEARCH.name));

		// Assert

		await waitFor(() =>
			expect(onLoadedSavedSearchIdChange).toHaveBeenCalledWith(
				SAVED_SEARCH.id,
			),
		);
		expect(onFiltersChange).toHaveBeenCalledWith([TAGS_FILTER]);
	});

	it("Should rename the saved search when the rename modal is confirmed", async () => {
		// Arrange

		const user = userEvent.setup();
		render({ savedSearches: [SAVED_SEARCH] });

		// Act

		await openRowActions(user);
		await user.click(await screen.findByText("Rename"));
		const dialog = await screen.findByRole("dialog");
		const input = within(dialog).getByRole("textbox");
		await user.clear(input);
		await user.type(input, "Renamed search");
		await user.click(
			within(dialog).getByRole("button", { name: "Rename" }),
		);

		// Assert

		await waitFor(() =>
			expect(renameSavedSearch).toHaveBeenCalledWith(SAVED_SEARCH.id, {
				name: "Renamed search",
			}),
		);
	});

	it("Should duplicate the saved search when Duplicate is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render({ savedSearches: [SAVED_SEARCH] });

		// Act

		await openRowActions(user);
		await user.click(await screen.findByText("Duplicate"));

		// Assert

		await waitFor(() =>
			expect(duplicateSavedSearch).toHaveBeenCalledWith(SAVED_SEARCH.id),
		);
	});

	it("Should clear the loaded saved search id when the currently loaded search is deleted", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onLoadedSavedSearchIdChange } = render({
			savedSearches: [SAVED_SEARCH],
			loadedSavedSearchId: SAVED_SEARCH.id,
		});

		// Act

		await openRowActions(user);
		await user.click(await screen.findByText("Delete"));
		const dialog = await screen.findByRole("dialog");
		await user.click(
			within(dialog).getByRole("button", { name: "Delete" }),
		);

		// Assert

		await waitFor(() =>
			expect(deleteSavedSearch).toHaveBeenCalledWith(SAVED_SEARCH.id),
		);
		expect(onLoadedSavedSearchIdChange).toHaveBeenCalledWith(null);
	});
});
