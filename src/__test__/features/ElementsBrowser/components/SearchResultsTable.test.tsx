import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchResultsTable from "../../../../features/ElementsBrowser/components/SearchResultsTable";
import { SearchElementResultDto } from "../../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../../types/elements/elementId";
import { paths } from "../../../../paths";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const CARD_RESULT: SearchElementResultDto = {
	type: "card",
	id: "card-1",
	name: "Card one",
	priority: { rank: 1, total: 10, percentage: 50 },
	due: "2026-01-01T00:00:00.000Z",
	tags: [
		{
			name: "math",
			createdAt: "2026-01-01T00:00:00.000Z",
			modifiedAt: "2026-01-01T00:00:00.000Z",
		},
	],
};

const EXTRACT_RESULT: SearchElementResultDto = {
	type: "extract",
	id: "extract-1",
	name: "Extract one",
	priority: { rank: 2, total: 10, percentage: 25.5 },
	due: null,
	tags: [],
};

const FOLDER_RESULT: SearchElementResultDto = {
	type: "folder",
	id: "folder-1",
	name: "Folder one",
	priority: { rank: 3, total: 10, percentage: 10 },
	due: null,
	tags: [],
};

interface RenderProps {
	results?: SearchElementResultDto[];
	selectedIds?: ElementId[];
}

function render({ results = [], selectedIds = [] }: RenderProps = {}) {
	const onSelectionChange = vi.fn();

	renderWithProviders(
		<SearchResultsTable
			results={results}
			selectedIds={selectedIds}
			onSelectionChange={onSelectionChange}
		/>,
	);

	return { onSelectionChange };
}

describe("SearchResultsTable", () => {
	it("Should show the empty state when results is empty", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByText("No elements match the current filters."),
		).toBeInTheDocument();
	});

	it("Should render a row per result with name, type, priority, due, and tags", () => {
		// Arrange, Act

		render({ results: [CARD_RESULT] });

		// Assert

		expect(screen.getByText(CARD_RESULT.name)).toBeInTheDocument();
		expect(screen.getByText("Card")).toBeInTheDocument();
		expect(screen.getByText("50.0%")).toBeInTheDocument();
		expect(
			screen.getByText(new Date(CARD_RESULT.due!).toLocaleString()),
		).toBeInTheDocument();
		expect(screen.getByText("math")).toBeInTheDocument();
	});

	it('Should render "—" for due when the result has no due date', () => {
		// Arrange, Act

		render({ results: [EXTRACT_RESULT] });

		// Assert

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("Should call onSelectionChange with all result ids when the header checkbox is toggled with none selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSelectionChange } = render({
			results: [CARD_RESULT, EXTRACT_RESULT],
			selectedIds: [],
		});

		// Act

		await user.click(screen.getByLabelText("Select all results"));

		// Assert

		expect(onSelectionChange).toHaveBeenCalledWith([
			{ type: CARD_RESULT.type, id: CARD_RESULT.id },
			{ type: EXTRACT_RESULT.type, id: EXTRACT_RESULT.id },
		]);
	});

	it("Should call onSelectionChange with an empty array when the header checkbox is toggled with all selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSelectionChange } = render({
			results: [CARD_RESULT, EXTRACT_RESULT],
			selectedIds: [
				{ type: CARD_RESULT.type, id: CARD_RESULT.id },
				{ type: EXTRACT_RESULT.type, id: EXTRACT_RESULT.id },
			],
		});

		// Act

		await user.click(screen.getByLabelText("Select all results"));

		// Assert

		expect(onSelectionChange).toHaveBeenCalledWith([]);
	});

	it("Should show the header checkbox as indeterminate when some but not all results are selected", () => {
		// Arrange, Act

		render({
			results: [CARD_RESULT, EXTRACT_RESULT],
			selectedIds: [{ type: CARD_RESULT.type, id: CARD_RESULT.id }],
		});
		const checkbox = screen.getByLabelText(
			"Select all results",
		) as HTMLInputElement;

		// Assert

		expect(checkbox).toHaveProperty("indeterminate", true);
	});

	it("Should not show the header checkbox as indeterminate when no results are selected", () => {
		// Arrange, Act

		render({ results: [CARD_RESULT, EXTRACT_RESULT], selectedIds: [] });
		const checkbox = screen.getByLabelText(
			"Select all results",
		) as HTMLInputElement;

		// Assert

		expect(checkbox).toHaveProperty("indeterminate", false);
	});

	it("Should call onSelectionChange adding the row's id when its checkbox is clicked and it was not selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSelectionChange } = render({
			results: [CARD_RESULT, EXTRACT_RESULT],
			selectedIds: [{ type: EXTRACT_RESULT.type, id: EXTRACT_RESULT.id }],
		});

		// Act

		await user.click(screen.getByLabelText(`Select ${CARD_RESULT.name}`));

		// Assert

		expect(onSelectionChange).toHaveBeenCalledWith([
			{ type: EXTRACT_RESULT.type, id: EXTRACT_RESULT.id },
			{ type: CARD_RESULT.type, id: CARD_RESULT.id },
		]);
	});

	it("Should call onSelectionChange removing the row's id when its checkbox is clicked and it was selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSelectionChange } = render({
			results: [CARD_RESULT, EXTRACT_RESULT],
			selectedIds: [
				{ type: CARD_RESULT.type, id: CARD_RESULT.id },
				{ type: EXTRACT_RESULT.type, id: EXTRACT_RESULT.id },
			],
		});

		// Act

		await user.click(screen.getByLabelText(`Select ${CARD_RESULT.name}`));

		// Assert

		expect(onSelectionChange).toHaveBeenCalledWith([
			{ type: EXTRACT_RESULT.type, id: EXTRACT_RESULT.id },
		]);
	});

	it("Should select every row between the last clicked row and a shift-clicked row", () => {
		// Arrange

		const { onSelectionChange } = render({
			results: [CARD_RESULT, EXTRACT_RESULT, FOLDER_RESULT],
			selectedIds: [],
		});

		// Act

		fireEvent.click(screen.getByLabelText(`Select ${CARD_RESULT.name}`));
		fireEvent.click(screen.getByLabelText(`Select ${FOLDER_RESULT.name}`), {
			shiftKey: true,
		});

		// Assert

		expect(onSelectionChange).toHaveBeenLastCalledWith([
			{ type: CARD_RESULT.type, id: CARD_RESULT.id },
			{ type: EXTRACT_RESULT.type, id: EXTRACT_RESULT.id },
			{ type: FOLDER_RESULT.type, id: FOLDER_RESULT.id },
		]);
	});

	it("Should link each row's name to the correct element path", () => {
		// Arrange, Act

		render({ results: [CARD_RESULT] });
		const row = screen.getByText(CARD_RESULT.name).closest("tr");

		// Assert

		expect(row).not.toBeNull();
		expect(
			within(row!).getByText(CARD_RESULT.name).closest("a"),
		).toHaveAttribute(
			"href",
			paths.element(CARD_RESULT.type, CARD_RESULT.id),
		);
	});
});
