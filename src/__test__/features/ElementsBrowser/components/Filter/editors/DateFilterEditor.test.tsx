import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/DateFilterEditor";
import { DateFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

const TODAY_FILTER: DateFilter = {
	id: "1",
	field: "dueDate",
	operator: "today",
	days: null,
	from: null,
	to: null,
};

const WITHIN_DAYS_FILTER: DateFilter = {
	id: "2",
	field: "dueDate",
	operator: "withinDays",
	days: 7,
	from: null,
	to: null,
};

const BEFORE_FILTER: DateFilter = {
	id: "3",
	field: "dueDate",
	operator: "before",
	days: null,
	from: null,
	to: null,
};

const BETWEEN_FILTER: DateFilter = {
	id: "4",
	field: "dueDate",
	operator: "between",
	days: null,
	from: null,
	to: null,
};

function render(filter: DateFilter) {
	const onChange = vi.fn();

	renderWithProviders(
		<DateFilterEditor filter={filter} onChange={onChange} />,
	);

	return { onChange };
}

describe("DateFilterEditor", () => {
	it("Should not show extra inputs when the operator is today", () => {
		// Arrange, Act

		render(TODAY_FILTER);

		// Assert

		expect(screen.queryByLabelText("Days")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Date range")).not.toBeInTheDocument();
	});

	it("Should show the days input pre-populated when the operator is withinDays", () => {
		// Arrange, Act

		render(WITHIN_DAYS_FILTER);

		// Assert

		expect(screen.getByLabelText("Days")).toHaveValue("7");
	});

	it("Should show a single date input when the operator is before", () => {
		// Arrange, Act

		render(BEFORE_FILTER);

		// Assert

		expect(screen.getByLabelText("Date")).toBeInTheDocument();
	});

	it("Should show a date range input when the operator is between", () => {
		// Arrange, Act

		render(BETWEEN_FILTER);

		// Assert

		expect(screen.getByLabelText("Date range")).toBeInTheDocument();
	});

	it("Should call onChange with the updated operator when a new operator is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render(TODAY_FILTER);

		// Act

		await user.click(screen.getByRole("combobox"));
		await user.click(await screen.findByText("after"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...TODAY_FILTER,
			operator: "after",
		});
	});

	it("Should call onChange with the updated days when the days input changes", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render(WITHIN_DAYS_FILTER);

		// Act

		await user.clear(screen.getByLabelText("Days"));
		await user.type(screen.getByLabelText("Days"), "3");

		// Assert

		expect(onChange).toHaveBeenLastCalledWith({
			...WITHIN_DAYS_FILTER,
			days: 3,
		});
	});
});
