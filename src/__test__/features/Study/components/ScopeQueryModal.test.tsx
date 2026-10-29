import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScopeQueryModal from "../../../../features/Study/components/ScopeQueryModal";
import { createSavedSearch } from "../../../../api/savedSearches/api/savedSearchesApi";
import { listStudyProfiles } from "../../../../api/study/api/studyProfileApi";
import { listBibliographicalSources } from "../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { searchElements } from "../../../../api/search/api/searchApi";
import { ElementFilter } from "../../../../api/savedSearches/dto/elementFilter";
import { createDefaultFilter } from "../../../../components/ElementFilters/utils/createDefaultFilter";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/savedSearches/api/savedSearchesApi"));
vi.mock(import("../../../../api/study/api/studyProfileApi"));
vi.mock(import("../../../../api/search/api/searchApi"));
vi.mock(
	import("../../../../api/bibliographicalSources/api/bibliographicalSourcesApi"),
);

const SAVED_SEARCH_ID = "a5d1f0c4-6a8e-4c1e-9d55-0b7c1f5a2e10";

function render(initialFilters: ElementFilter[] = []) {
	const onClose = vi.fn();
	const onUseCustom = vi.fn();
	const onCreated = vi.fn();

	renderWithProviders(
		<ScopeQueryModal
			opened
			initialFilters={initialFilters}
			onClose={onClose}
			onUseCustom={onUseCustom}
			onCreated={onCreated}
		/>,
	);

	return { onClose, onUseCustom, onCreated };
}

describe("ScopeQueryModal", () => {
	beforeEach(() => {
		vi.mocked(listStudyProfiles).mockResolvedValue([]);
		vi.mocked(listBibliographicalSources).mockResolvedValue([]);
		vi.mocked(searchElements).mockResolvedValue([]);
		vi.mocked(createSavedSearch).mockResolvedValue({
			id: SAVED_SEARCH_ID,
			createdAt: "2026-01-01T00:00:00Z",
			modifiedAt: "2026-01-01T00:00:00Z",
			name: "Rust",
			sort: null,
		});
	});

	it("Should disable saving when the name is empty", async () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			await screen.findByRole("button", { name: "Save and study" }),
		).toBeDisabled();
	});

	it("Should create the saved search and report it when saved", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onClose, onCreated } = render();
		await user.type(await screen.findByLabelText("Name"), "  Rust  ");

		// Act

		await user.click(
			screen.getByRole("button", { name: "Save and study" }),
		);

		// Assert

		await waitFor(() =>
			expect(onCreated).toHaveBeenCalledWith(
				expect.objectContaining({ id: SAVED_SEARCH_ID }),
			),
		);
		expect(createSavedSearch).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Rust", filters: [] }),
		);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Should preview the elements matching the filters when opened", async () => {
		// Arrange

		vi.mocked(searchElements).mockResolvedValue([
			{
				type: "card",
				id: "c1d2e3f4-0000-4000-8000-000000000001",
				name: "Rust ownership",
				priority: { position: 1, total: 1, percentile: 0 },
				due: null,
				tags: [],
			},
		]);

		// Act

		render();

		// Assert

		expect(await screen.findByText("Rust ownership")).toBeInTheDocument();
		expect(screen.getByText("Matching elements (1)")).toBeInTheDocument();
		expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
	});

	it("Should use the filters without saving when use without saving is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const filter = createDefaultFilter("tags");
		const { onUseCustom, onClose } = render([filter]);

		// Act

		await user.click(
			await screen.findByRole("button", { name: "Use without saving" }),
		);

		// Assert

		expect(onUseCustom).toHaveBeenCalledWith([filter]);
		expect(createSavedSearch).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
