import userEvent from "@testing-library/user-event";
import ElementProfileRow from "../../../../features/Study/components/ElementProfileRow";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { assignStudyProfile } from "../../../../api/study/api/studyProfileApi";
import { getElementDetails } from "../../../../api/elements/api/elementsApi";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import { ElementDetailsResponseDto } from "../../../../api/elements/dto/elementDetailsDto";

vi.mock(import("../../../../api/study/api/studyProfileApi.ts"));
vi.mock(import("../../../../api/elements/api/elementsApi.ts"));

const cardElementId = { type: "card" as const, id: "card-1" };

const profile: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2024-01-01T00:00:00Z",
	modifiedAt: "2024-01-01T00:00:00Z",
	name: "Default",
	isDefault: true,
	desiredRetention: 0.9,
	fsrsParams: [],
	learningSteps: [],
	relearningSteps: [],
	initialIntervalMultiplier: 1.2,
	initialIntervalDays: 1,
	minIntervalDays: 1,
};

function makeDetails(
	overrides: Partial<ElementDetailsResponseDto> = {},
): ElementDetailsResponseDto {
	return {
		bibliographicalSource: null,
		derivedFromName: null,
		cardReview: null,
		learningAssetReview: null,
		effectiveProfile: { profile, source: "default", inheritedFrom: null },
		profiles: [profile],
		inheritedProfileName: "Default",
		priority: { rank: 1, total: 1, percentage: 0 },
		...overrides,
	};
}

describe("ElementProfileRow", () => {
	it("Should show the inherited profile name when the effective profile is not direct", () => {
		// Arrange

		const details = makeDetails();

		// Act

		renderWithProviders(
			<ElementProfileRow elementId={cardElementId} details={details} />,
		);

		// Assert

		expect(document.querySelector("input")?.getAttribute("value")).toBe(
			"Inherit from parent (Default)",
		);
	});

	it("Should reload element details after assigning a study profile", async () => {
		// Arrange

		vi.mocked(assignStudyProfile).mockResolvedValue(undefined);
		vi.mocked(getElementDetails).mockResolvedValue(makeDetails());
		const details = makeDetails();
		const user = userEvent.setup();

		renderWithProviders(
			<ElementProfileRow elementId={cardElementId} details={details} />,
		);

		// Act

		const input = document.querySelector("input");
		if (!input) throw new Error("input not found");
		await user.click(input);
		const option = await vi.waitFor(() => {
			const options = document.querySelectorAll("[role='option']");
			// [0] is "Inherit from parent", [1] is the "Default" profile.
			const found = options[1];
			if (!found) throw new Error("option not found");
			return found;
		});
		await user.click(option as HTMLElement);

		// Assert

		await vi.waitFor(() => {
			expect(assignStudyProfile).toHaveBeenCalledWith(
				cardElementId,
				"profile-1",
			);
			expect(getElementDetails).toHaveBeenCalledWith(cardElementId);
		});
	});
});
