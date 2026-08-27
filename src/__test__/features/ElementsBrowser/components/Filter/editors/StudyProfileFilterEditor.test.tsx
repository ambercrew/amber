import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudyProfileFilterEditor from "../../../../../../features/ElementsBrowser/components/Filter/editors/StudyProfileFilterEditor";
import { StudyProfileFilter } from "../../../../../../api/savedSearches/dto/elementFilter";
import { StudyProfileDto } from "../../../../../../api/study/dto/studyProfileDto";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

const DEFAULT_PROFILE: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
	name: "Default",
	isDefault: true,
	desiredRetention: 0.9,
	fsrsParams: [],
	learningSteps: [],
	relearningSteps: [],
	initialIntervalMultiplier: 1,
	initialIntervalDays: 1,
	minIntervalDays: 1,
};

const EXAM_PROFILE: StudyProfileDto = {
	...DEFAULT_PROFILE,
	id: "profile-2",
	name: "Exam prep",
	isDefault: false,
};

const FILTER: StudyProfileFilter = {
	id: "1",
	field: "studyProfile",
	operator: "isAnyOf",
	profileIds: [DEFAULT_PROFILE.id],
};

function render(
	filter: StudyProfileFilter = FILTER,
	profiles: StudyProfileDto[] = [DEFAULT_PROFILE, EXAM_PROFILE],
) {
	const onChange = vi.fn();

	renderWithProviders(
		<StudyProfileFilterEditor
			filter={filter}
			profiles={profiles}
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

describe("StudyProfileFilterEditor", () => {
	it("Should pre-populate the operator and selected profiles from the given filter", () => {
		// Arrange, Act

		render();

		// Assert

		expect(screen.getAllByRole("combobox")[0]).toHaveValue("is any of");
		expect(getPillByText("Default")).toBeInTheDocument();
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

	it("Should call onChange with the added profile id when a new study profile is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();

		// Act

		await user.click(screen.getByPlaceholderText("Select study profiles"));
		await user.click(await screen.findByText("Exam prep"));

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			...FILTER,
			profileIds: [DEFAULT_PROFILE.id, EXAM_PROFILE.id],
		});
	});

	it("Should call onChange with the profile id removed when its pill remove button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render();
		const pill = getPillByText("Default");

		// Act

		await user.click(within(pill).getByRole("button", { hidden: true }));

		// Assert

		expect(onChange).toHaveBeenCalledWith({ ...FILTER, profileIds: [] });
	});
});
