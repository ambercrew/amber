import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PriorityFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/PriorityFilterEditor";
import { PriorityFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

const FILTER: PriorityFilter = {
	id: "1",
	field: "priority",
	operator: "between",
	min: 70,
	max: 100,
};

function render(filter: PriorityFilter = FILTER) {
	const onChange = vi.fn();

	renderWithProviders(
		<PriorityFilterEditor filter={filter} onChange={onChange} />,
	);

	return { onChange };
}

describe("PriorityFilterEditor", () => {
	it("Should show the given filter's min and max as the priority range text", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getByText("Priority 70.00–100.00%")).toBeInTheDocument();
	});

	it("Should call onChange with the increased min when the min thumb is moved right", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		const [minThumb] = screen.getAllByRole("slider");
		act(() => minThumb.focus());
		await user.keyboard("{ArrowRight}");
		await act(async () => {});

		// Assert

		expect(onChange).toHaveBeenCalledWith({ ...FILTER, min: 71 });
	});

	it("Should call onChange with the decreased max when the max thumb is moved left", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		const [, maxThumb] = screen.getAllByRole("slider");
		act(() => maxThumb.focus());
		await user.keyboard("{ArrowLeft}");
		await act(async () => {});

		// Assert

		expect(onChange).toHaveBeenCalledWith({ ...FILTER, max: 99 });
	});
});
