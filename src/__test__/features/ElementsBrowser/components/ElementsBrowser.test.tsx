import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElementsBrowser from "../../../../features/ElementsBrowser/components/ElementsBrowser";
import { TagsFilter } from "../../../../api/savedSearches/dto/elementFilter";
import { SearchElementResultDto } from "../../../../api/search/dto/searchElementResultDto";
import { listBibliographicalSources } from "../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { listStudyProfiles } from "../../../../api/study/api/studyProfileApi";
import { listSavedSearches } from "../../../../api/savedSearches/api/savedSearchesApi";
import { searchElements } from "../../../../api/search/api/searchApi";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(
	import("../../../../api/bibliographicalSources/api/bibliographicalSourcesApi"),
);
vi.mock(import("../../../../api/study/api/studyProfileApi"));
vi.mock(import("../../../../api/savedSearches/api/savedSearchesApi"));
vi.mock(import("../../../../api/search/api/searchApi"));

const TAGS_FILTER: TagsFilter = {
	id: "filter-1",
	field: "tags",
	operator: "isAnyOf",
	tags: ["math"],
};

const RESULTS: SearchElementResultDto[] = [
	{
		type: "learningAsset",
		id: "asset-1",
		name: "Intro to calculus",
		priority: { rank: 1, total: 3, percentage: 90 },
		due: null,
		tags: [],
	},
	{
		type: "extract",
		id: "extract-1",
		name: "Chain rule extract",
		priority: { rank: 2, total: 3, percentage: 50 },
		due: null,
		tags: [],
	},
	{
		type: "card",
		id: "card-1",
		name: "Chain rule card",
		priority: { rank: 3, total: 3, percentage: 10 },
		due: null,
		tags: [],
	},
];

function render(memoryRouterProps?: { initialEntries: object[] }) {
	return renderWithProviders(<ElementsBrowser />, {
		memoryRouterProps,
	});
}

async function addTagsFilter(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Filter" }));
	const menus = await screen.findAllByRole("menu");
	const menu = menus.find(m => within(m).queryByText("Filter by"));
	if (!menu) throw new Error("Filter menu did not open");
	await user.click(within(menu).getByText("Tags"));
}

describe("ElementsBrowser", () => {
	beforeEach(() => {
		vi.mocked(listBibliographicalSources).mockResolvedValue([]);
		vi.mocked(listStudyProfiles).mockResolvedValue([]);
		vi.mocked(listSavedSearches).mockResolvedValue([]);
		vi.mocked(searchElements).mockResolvedValue(RESULTS);
	});

	it("Should render the page title and subtitle when mounted", async () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Browser" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(/Search and filter every element/),
		).toBeInTheDocument();
		await waitFor(() => expect(searchElements).toHaveBeenCalled());
	});

	it("Should load sources, profiles, saved searches, and results when mounted", async () => {
		// Arrange, Act

		render();

		// Assert

		expect(listBibliographicalSources).toHaveBeenCalled();
		expect(listStudyProfiles).toHaveBeenCalled();
		expect(listSavedSearches).toHaveBeenCalled();
		await waitFor(() =>
			expect(searchElements).toHaveBeenCalledWith({ filters: [] }),
		);
		expect(
			await screen.findByText("Intro to calculus"),
		).toBeInTheDocument();
	});

	it("Should add a filter chip and re-run search when a filter is added", async () => {
		// Arrange

		const user = userEvent.setup();
		render();
		await screen.findByText("Intro to calculus");
		vi.mocked(searchElements).mockClear();

		// Act

		await addTagsFilter(user);

		// Assert

		expect(
			await screen.findByLabelText("Remove Tags filter"),
		).toBeInTheDocument();
		await waitFor(() =>
			expect(searchElements).toHaveBeenCalledWith({
				filters: [expect.objectContaining({ field: "tags" })],
			}),
		);
	});

	it("Should remove a filter chip and re-run search when the filter is removed", async () => {
		// Arrange

		const user = userEvent.setup();
		render({
			initialEntries: [
				{
					pathname: "/browser",
					state: {
						elementsBrowser: {
							filters: [TAGS_FILTER],
							loadedSavedSearchId: null,
							selectedIds: [],
						},
					},
				},
			],
		});
		await screen.findByText("Intro to calculus");
		vi.mocked(searchElements).mockClear();

		// Act

		await user.click(screen.getByLabelText("Remove Tags filter"));

		// Assert

		expect(
			screen.queryByLabelText("Remove Tags filter"),
		).not.toBeInTheDocument();
		await waitFor(() =>
			expect(searchElements).toHaveBeenCalledWith({ filters: [] }),
		);
	});

	it("Should clear row selection when the filters change", async () => {
		// Arrange

		const user = userEvent.setup();
		render();
		const checkbox = await screen.findByLabelText(
			"Select Intro to calculus",
		);
		await user.click(checkbox);
		expect(checkbox).toBeChecked();

		// Act

		await addTagsFilter(user);
		await screen.findByLabelText("Remove Tags filter");

		// Assert

		await waitFor(() => expect(checkbox).not.toBeChecked());
	});

	it("Should restore filters and selected rows from location state when mounted", async () => {
		// Arrange, Act

		render({
			initialEntries: [
				{
					pathname: "/browser",
					state: {
						elementsBrowser: {
							filters: [TAGS_FILTER],
							loadedSavedSearchId: null,
							selectedIds: [
								{ type: "learningAsset", id: "asset-1" },
							],
						},
					},
				},
			],
		});

		// Assert

		expect(screen.getByLabelText("Remove Tags filter")).toBeInTheDocument();
		expect(
			await screen.findByLabelText("Select Intro to calculus"),
		).toBeChecked();
	});
});
