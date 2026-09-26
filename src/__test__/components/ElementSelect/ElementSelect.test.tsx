import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElementSelect from "../../../components/ElementSelect/ElementSelect";
import { SearchElementResultDto } from "../../../api/search/dto/searchElementResultDto";
import { searchElements } from "../../../api/search/api/searchApi";
import { getElementName } from "../../../api/elements/api/elementsApi";
import { ElementId } from "../../../types/elements/elementId";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

vi.mock(import("../../../api/search/api/searchApi"));
vi.mock(import("../../../api/elements/api/elementsApi"));

// The backend rejects filter ids that aren't UUIDs.
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const RESULTS: SearchElementResultDto[] = [
	{
		type: "folder",
		id: "folder-1",
		name: "Physics",
		priority: { position: 1, total: 2, percentile: 0 },
		due: null,
		tags: [],
	},
	{
		type: "learningAsset",
		id: "asset-1",
		name: "Mechanics",
		priority: { position: 2, total: 2, percentile: 100 },
		due: null,
		tags: [],
	},
];

function render(
	props: Partial<Parameters<typeof ElementSelect>[0]> = {},
	value: ElementId | null = null,
) {
	const onChange = vi.fn();

	renderWithProviders(
		<ElementSelect value={value} onChange={onChange} {...props} />,
	);

	return { onChange };
}

describe("ElementSelect", () => {
	beforeEach(() => {
		vi.mocked(searchElements).mockResolvedValue(RESULTS);
	});

	it("Should not search when the dropdown was never opened", () => {
		// Arrange, Act

		render();

		// Assert

		expect(searchElements).not.toHaveBeenCalled();
	});

	it("Should fetch the top elements with a limit when the dropdown opens", async () => {
		// Arrange

		const user = userEvent.setup();
		render({ limit: 5 });

		// Act

		await user.click(screen.getByRole("textbox"));

		// Assert

		expect(await screen.findByText("Physics")).toBeInTheDocument();
		expect(searchElements).toHaveBeenCalledWith({ filters: [], limit: 5 });
	});

	it("Should search by name and element type when a query is typed", async () => {
		// Arrange

		const user = userEvent.setup();
		render({ types: ["folder"] });

		// Act

		await user.type(screen.getByRole("textbox"), "phy");

		// Assert

		await waitFor(() =>
			expect(searchElements).toHaveBeenCalledWith({
				filters: [
					{
						id: expect.stringMatching(UUID_PATTERN) as string,
						field: "name",
						operator: "contains",
						value: "phy",
					},
					{
						id: expect.stringMatching(UUID_PATTERN) as string,
						field: "elementType",
						operator: "isAnyOf",
						types: ["folder"],
					},
				],
				limit: 20,
			}),
		);
	});

	it("Should call onChange with the element id when an option is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getByRole("textbox"));
		await user.click(await screen.findByText("Mechanics"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			type: "learningAsset",
			id: "asset-1",
		});
	});

	it("Should show the selected element's name when a value is given", async () => {
		// Arrange

		vi.mocked(getElementName).mockResolvedValue("Physics");

		// Act

		render({}, { type: "folder", id: "folder-1" });

		// Assert

		await waitFor(() =>
			expect(screen.getByRole("textbox")).toHaveValue("Physics"),
		);
		expect(getElementName).toHaveBeenCalledWith({
			type: "folder",
			id: "folder-1",
		});
	});

	it("Should show the error when fetching the selected element's name fails", async () => {
		// Arrange

		vi.mocked(getElementName).mockRejectedValue("Database locked");

		// Act

		render({}, { type: "folder", id: "folder-1" });

		// Assert

		expect(await screen.findByText("Database locked")).toBeInTheDocument();
	});

	it("Should show the error and drop stale options when a search fails", async () => {
		// Arrange

		const user = userEvent.setup();
		render();
		await user.click(screen.getByRole("textbox"));
		await screen.findByText("Physics");
		vi.mocked(searchElements).mockRejectedValue("Search failed");

		// Act

		await user.type(screen.getByRole("textbox"), "x");

		// Assert

		expect(await screen.findByText("Search failed")).toBeInTheDocument();
		expect(screen.queryByText("Mechanics")).not.toBeInTheDocument();
	});

	it("Should show no results instead of an earlier error when a later search finds nothing", async () => {
		// Arrange

		const user = userEvent.setup();
		vi.mocked(searchElements).mockRejectedValueOnce("Search failed");
		render();
		await user.click(screen.getByRole("textbox"));
		await screen.findByText("Search failed");
		vi.mocked(searchElements).mockResolvedValue([]);

		// Act

		await user.type(screen.getByRole("textbox"), "x");

		// Assert

		expect(
			await screen.findByText("No elements found"),
		).toBeInTheDocument();
		expect(screen.queryByText("Search failed")).not.toBeInTheDocument();
	});
});
