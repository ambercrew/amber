import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterChip from "../../../../../features/ElementsBrowser/components/Filter/FilterChip";
import {
	ElementFilter,
	NameFilter,
	PriorityFilter,
} from "../../../../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../../../api/study/dto/studyProfileDto";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

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
		expect(screen.getByText("70–100%")).toBeInTheDocument();
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

		expect(await screen.findByText("Priority 70–100%")).toBeInTheDocument();
	});
});
