import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterChip from "../../../../../features/ElementsBrowser/components/Filter/FilterChip";
import {
	DateFilter,
	ElementFilter,
	ElementFilterField,
	NameFilter,
	PriorityFilter,
} from "../../../../../api/savedSearches/dto/elementFilter";
import { createDefaultFilter } from "../../../../../features/ElementsBrowser/utils/createDefaultFilter";
import { BibliographicalSourceResponseDto } from "../../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../../../api/study/dto/studyProfileDto";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../api/search/api/searchApi"));
vi.mock(import("../../../../../api/elements/api/elementsApi"));

const NAME_FILTER: NameFilter = {
	id: "1",
	field: "name",
	operator: "contains",
	value: "Photosynthesis",
};

const PRIORITY_FILTER: PriorityFilter = {
	id: "2",
	field: "priority",
	operator: "between",
	min: 70,
	max: 100,
};

function render(
	filter: ElementFilter,
	{
		sources = [],
		profiles = [],
		defaultOpened,
	}: {
		sources?: BibliographicalSourceResponseDto[];
		profiles?: StudyProfileDto[];
		defaultOpened?: boolean;
	} = {},
) {
	const onChange = vi.fn();
	const onRemove = vi.fn();

	renderWithProviders(
		<FilterChip
			filter={filter}
			sources={sources}
			profiles={profiles}
			defaultOpened={defaultOpened}
			onChange={onChange}
			onRemove={onRemove}
		/>,
	);

	return { onChange, onRemove };
}

describe("FilterChip", () => {
	it("Should render the field label, operator and value for a name filter", () => {
		// Arrange, Act

		render(NAME_FILTER);

		// Assert

		expect(screen.getByText("Name")).toBeInTheDocument();
		expect(screen.getByText("contains")).toBeInTheDocument();
		expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
	});

	it("Should render the field label and value for a priority filter", () => {
		// Arrange, Act

		render(PRIORITY_FILTER);

		// Assert

		expect(screen.getByText("Priority")).toBeInTheDocument();
		expect(screen.getByText("70.00–100.00%")).toBeInTheDocument();
	});

	it("Should call onRemove when the remove button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onRemove } = render(NAME_FILTER);

		// Act

		await user.click(screen.getByLabelText("Remove Name filter"));

		// Assert

		expect(onRemove).toHaveBeenCalled();
	});

	it("Should show the NameFilterEditor's inputs when the name filter chip is opened", async () => {
		// Arrange

		const user = userEvent.setup();
		render(NAME_FILTER);

		// Act

		await user.click(screen.getByText("Name"));

		// Assert

		expect(
			await screen.findByDisplayValue("Photosynthesis"),
		).toBeInTheDocument();
	});

	it("Should show the PriorityFilterEditor's inputs when the priority filter chip is opened", async () => {
		// Arrange, Act

		render(PRIORITY_FILTER, { defaultOpened: true });

		// Act, Assert

		expect(
			await screen.findByText("Priority 70.00–100.00%"),
		).toBeInTheDocument();
	});

	it.each<[ElementFilterField, () => HTMLElement]>([
		["name", () => screen.getByPlaceholderText("Name")],
		["tags", () => screen.getByPlaceholderText("Add tags")],
		[
			"bibliographicalSource",
			() => screen.getByPlaceholderText("Select bibliographical sources"),
		],
		[
			"elementType",
			() => screen.getByPlaceholderText("Select element types"),
		],
		[
			"studyProfile",
			() => screen.getByPlaceholderText("Select study profiles"),
		],
		[
			"descendantOf",
			() => screen.getByPlaceholderText("Search for an element"),
		],
		["createdDate", () => screen.getByLabelText("Days")],
		["priority", () => screen.getAllByRole("slider")[0]],
		// "today" has no value to enter, so the operator select gets focus.
		["dueDate", () => screen.getByRole("combobox")],
	])(
		"Should focus the editor's main field when a %s filter chip opens",
		async (field, getField) => {
			// Arrange, Act

			render(createDefaultFilter(field), { defaultOpened: true });

			// Assert

			await waitFor(() => expect(getField()).toHaveFocus());
		},
	);

	it.each<[DateFilter["operator"], string]>([
		["before", "Date"],
		["between", "Date range"],
	])(
		"Should focus the date field when a date filter chip with the %s operator opens",
		async (operator, label) => {
			// Arrange

			const filter: DateFilter = {
				id: "3",
				field: "dueDate",
				operator,
				days: null,
				from: null,
				to: null,
			};

			// Act

			render(filter, { defaultOpened: true });

			// Assert

			await waitFor(() =>
				expect(screen.getByLabelText(label)).toHaveFocus(),
			);
		},
	);

	it("Should be reachable with Tab when the chip is rendered", async () => {
		// Arrange

		const user = userEvent.setup();
		render(NAME_FILTER);

		// Act

		await user.tab();

		// Assert

		expect(
			screen.getByRole("button", { name: "Edit Name filter" }),
		).toHaveFocus();
	});

	it.each(["{Enter}", " "])(
		"Should open the editor and focus its field when %s is pressed on the chip",
		async key => {
			// Arrange

			const user = userEvent.setup();
			render(NAME_FILTER);
			await user.tab();

			// Act

			await user.keyboard(key);

			// Assert

			await waitFor(() =>
				expect(screen.getByPlaceholderText("Name")).toHaveFocus(),
			);
		},
	);

	it("Should return focus to the chip when the editor is closed with Escape", async () => {
		// Arrange

		const user = userEvent.setup();
		render(NAME_FILTER);
		await user.tab();
		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(screen.getByPlaceholderText("Name")).toHaveFocus(),
		);

		// Act

		await user.keyboard("{Escape}");

		// Assert

		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Edit Name filter" }),
			).toHaveFocus(),
		);
	});

	it("Should remove without opening the editor when Enter is pressed on the remove button", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onRemove } = render(NAME_FILTER);
		screen.getByLabelText("Remove Name filter").focus();

		// Act

		await user.keyboard("{Enter}");

		// Assert

		expect(onRemove).toHaveBeenCalled();
		expect(screen.queryByPlaceholderText("Name")).not.toBeInTheDocument();
	});

	it("Should reach the remove button with Tab when the chip is focused", async () => {
		// Arrange

		const user = userEvent.setup();
		render(NAME_FILTER);
		await user.tab();

		// Act

		await user.tab();

		// Assert

		expect(screen.getByLabelText("Remove Name filter")).toHaveFocus();
	});
});
