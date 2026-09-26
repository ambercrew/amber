import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OriginSection from "../../../../features/Aside/components/OriginSection";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../test-utils/renderWithProviders";
import {
	getElementName,
	setDerivedFrom,
} from "../../../../api/elements/api/elementsApi";
import { searchElements } from "../../../../api/search/api/searchApi";
import { listBibliographicalSources } from "../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { ElementId } from "../../../../types/elements/elementId";

vi.mock(import("../../../../api/elements/api/elementsApi"));
vi.mock(import("../../../../api/search/api/searchApi"));
vi.mock(
	import("../../../../api/bibliographicalSources/api/bibliographicalSourcesApi"),
);

const ELEMENT_ID: ElementId = { type: "extract", id: "extract-1" };
const SOURCE_ID: ElementId = { type: "learningAsset", id: "asset-1" };

function render(derivedFrom: ElementId | null = null) {
	renderWithProviders(
		<OriginSection
			elementId={ELEMENT_ID}
			bibliographicalSourceId={null}
			derivedFrom={derivedFrom}
			details={null}
		/>,
	);
}

describe("OriginSection", () => {
	beforeEach(() => {
		localStorage.setItem("element-info-panel.origin.opened", "true");
		vi.mocked(listBibliographicalSources).mockResolvedValue([]);
		vi.mocked(getElementName).mockResolvedValue("Mechanics");
		vi.mocked(searchElements).mockResolvedValue([
			{
				...SOURCE_ID,
				name: "Mechanics",
				priority: { position: 1, total: 1, percentile: 0 },
				due: null,
				tags: [],
			},
		]);
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("Should set derived from to the picked element when an element is chosen", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await user.click(screen.getByPlaceholderText("Search for an element"));
		await user.click(await screen.findByText("Mechanics"));

		// Assert

		await waitFor(() =>
			expect(setDerivedFrom).toHaveBeenCalledWith(ELEMENT_ID, SOURCE_ID),
		);
	});

	it("Should clear derived from when the clear button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render(SOURCE_ID);

		// Act

		await user.click(screen.getByLabelText("Clear element"));

		// Assert

		await waitFor(() =>
			expect(setDerivedFrom).toHaveBeenCalledWith(ELEMENT_ID, null),
		);
	});

	it("Should navigate to the derived from element when Go to element is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render(SOURCE_ID);

		// Act

		await user.click(screen.getByLabelText("Go to element"));

		// Assert

		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"/learningAsset/asset-1",
		);
	});
});
