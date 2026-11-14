import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { searchContent } from "../../../../../api/search/api/searchApi";
import { SearchContentResponseDto } from "../../../../../api/search/dto/searchContentResponseDto";
import GlobalSearchPanel from "../../../../../features/Sidebar/components/GlobalSearch/GlobalSearchPanel";
import { setupStore } from "../../../../../stores/store";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../api/search/api/searchApi"));

const RESPONSE: SearchContentResponseDto = {
	elements: [
		{
			elementId: { type: "learningAsset", id: "asset-1" },
			name: "Biology",
			matches: [
				{ index: 0, before: "the ", text: "synth", after: "esis" },
				{ index: 1, before: "photo", text: "synth", after: "" },
			],
		},
		{
			elementId: { type: "card", id: "card-1" },
			name: "Plants",
			matches: [{ index: 0, before: "", text: "Synth", after: "" }],
		},
	],
	truncated: false,
};

describe("GlobalSearchPanel", () => {
	beforeEach(() => {
		vi.mocked(searchContent).mockResolvedValue(RESPONSE);
	});

	it("Should show the result count and each element's matches when a query is typed", async () => {
		// Arrange

		const user = userEvent.setup();
		renderWithProviders(<GlobalSearchPanel />);

		// Act

		await user.type(
			screen.getByRole("textbox", { name: "Search in all elements" }),
			"synth",
		);

		// Assert

		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				"3 results in 2 elements",
			),
		);
		expect(searchContent).toHaveBeenLastCalledWith({
			query: "synth",
			caseSensitive: false,
		});
		expect(screen.getByText("Biology")).toBeInTheDocument();
		expect(screen.getByText("Plants")).toBeInTheDocument();
		expect(screen.getAllByText(/^synth$/i)).toHaveLength(3);
	});

	it("Should open the element on that match when a match is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const store = setupStore();
		renderWithProviders(<GlobalSearchPanel />, { store });
		await user.type(
			screen.getByRole("textbox", { name: "Search in all elements" }),
			"synth",
		);
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				"3 results in 2 elements",
			),
		);

		// Act

		await user.click(screen.getByText("photo"));

		// Assert

		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"asset-1",
		);
		expect(store.getState().search).toMatchObject({
			opened: true,
			query: "synth",
			pendingMatch: {
				elementId: { type: "learningAsset", id: "asset-1" },
				index: 1,
			},
		});
	});

	it("Should hide an element's matches when its row is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		renderWithProviders(<GlobalSearchPanel />);
		await user.type(
			screen.getByRole("textbox", { name: "Search in all elements" }),
			"synth",
		);
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				"3 results in 2 elements",
			),
		);

		// Act

		await user.click(screen.getByText("Biology"));

		// Assert

		expect(screen.queryByText("photo")).not.toBeInTheDocument();
		expect(screen.getAllByText(/^synth$/i)).toHaveLength(1);
	});

	it("Should say the results were cut short when the backend truncated them", async () => {
		// Arrange

		vi.mocked(searchContent).mockResolvedValue({
			...RESPONSE,
			truncated: true,
		});
		const user = userEvent.setup();
		renderWithProviders(<GlobalSearchPanel />);

		// Act

		await user.type(
			screen.getByRole("textbox", { name: "Search in all elements" }),
			"synth",
		);

		// Assert

		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				"First 3 results in 2 elements",
			),
		);
		expect(
			screen.getByText("Refine your search to see the rest."),
		).toBeInTheDocument();
	});

	it("Should keep searching without an error when the backend reports the search superseded", async () => {
		// Arrange

		vi.mocked(searchContent).mockResolvedValue(null);
		const user = userEvent.setup();
		renderWithProviders(<GlobalSearchPanel />);

		// Act

		await user.type(
			screen.getByRole("textbox", { name: "Search in all elements" }),
			"synth",
		);

		// Assert

		await waitFor(() => expect(searchContent).toHaveBeenCalled());
		expect(screen.getByRole("status")).toHaveTextContent("Searching…");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
