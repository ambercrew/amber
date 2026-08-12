import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BibliographicalSourceFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/BibliographicalSourceFilterEditor";
import { BibliographicalSourceFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

const BOOK_SOURCE: BibliographicalSourceResponseDto = {
	id: "source-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
	title: "Origin of Species",
	authors: "Charles Darwin",
	publicationDate: null,
	sourceType: "File",
	location: null,
	elementCount: 3,
};

const ARTICLE_SOURCE: BibliographicalSourceResponseDto = {
	...BOOK_SOURCE,
	id: "source-2",
	title: "On Photosynthesis",
};

const FILTER: BibliographicalSourceFilter = {
	id: "1",
	field: "bibliographicalSource",
	operator: "isAnyOf",
	sourceIds: [BOOK_SOURCE.id],
};

function render(
	filter: BibliographicalSourceFilter = FILTER,
	sources: BibliographicalSourceResponseDto[] = [BOOK_SOURCE, ARTICLE_SOURCE],
) {
	const onChange = vi.fn();

	renderWithProviders(
		<BibliographicalSourceFilterEditor
			filter={filter}
			sources={sources}
			onChange={onChange}
		/>,
	);

	return { onChange };
}

function getPillByText(text: string): HTMLElement {
	const pill = screen
		.getAllByText(text)
		.map(el => el.closest(".mantine-Pill-root"))
		.find(el => el !== null);
	if (!pill) {
		throw new Error(`No pill found for text: ${text}`);
	}
	return pill as HTMLElement;
}

describe("BibliographicalSourceFilterEditor", () => {
	it("Should pre-populate the operator and selected sources from the given filter", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getAllByRole("combobox")[0]).toHaveValue("is any of");
		expect(getPillByText("Origin of Species")).toBeInTheDocument();
	});

	it("Should call onChange with the updated operator when a new operator is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getAllByRole("combobox")[0]);
		await user.click(await screen.findByText("is none of"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			operator: "isNoneOf",
		});
	});

	it("Should call onChange with the added source id when a new source is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(
			screen.getByPlaceholderText("Select bibliographical sources"),
		);
		await user.click(await screen.findByText("On Photosynthesis"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			sourceIds: [BOOK_SOURCE.id, ARTICLE_SOURCE.id],
		});
	});

	it("Should call onChange with the source id removed when its pill remove button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();
		const pill = getPillByText("Origin of Species");

		// Act

		await user.click(within(pill).getByRole("button", { hidden: true }));

		// Assert

		expect(onChange).toHaveBeenCalledWith({ ...FILTER, sourceIds: [] });
	});
});
