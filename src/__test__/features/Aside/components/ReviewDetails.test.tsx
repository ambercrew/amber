import { act, screen } from "@testing-library/react";
import ReviewDetails from "../../../../features/Aside/components/ReviewDetails";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { CardReviewDto } from "../../../../api/study/dto/cardReviewDto";
import { ElementDetailsResponseDto } from "../../../../api/elements/dto/elementDetailsDto";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";

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

const cardElement: AnyElementDto = {
	type: "card",
	data: {
		meta: {
			elementId: cardElementId,
			name: "Card 1",
			parent: null,
			position: "0",
			tags: [],
			createdAt: "2024-01-01T00:00:00Z",
			modifiedAt: "2024-01-01T00:00:00Z",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
		front: "Front",
		back: "Back",
	},
};

const cardReview: CardReviewDto = {
	cardId: cardElementId.id,
	due: "2024-02-01T00:00:00Z",
	stability: 2.31,
	difficulty: 5.12,
	reps: 3,
	lapses: 1,
	state: "review",
	lastReviewed: "2024-01-01T00:00:00Z",
	scheduledDays: 44,
	learningSteps: 2,
};

function makeDetails(review: CardReviewDto | null): ElementDetailsResponseDto {
	return {
		bibliographicalSource: null,
		derivedFromName: null,
		cardReview: review,
		learningAssetReview: null,
		effectiveProfile: { profile, source: "default", inheritedFrom: null },
		profiles: [],
		inheritedProfileName: null,
		priority: { rank: 3, total: 5, percentage: 50 },
	};
}

function valueFor(label: string): string | null {
	// Each InfoField renders its label and value as sibling <Text> elements.
	return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

describe("ReviewDetails", () => {
	it("Should show the interval and learning step when the card has a review", async () => {
		// Arrange

		const details = makeDetails(cardReview);

		// Act

		renderWithProviders(
			<ReviewDetails element={cardElement} details={details} />,
		);
		await act(() => Promise.resolve());

		// Assert

		expect(valueFor("Interval (days)")).toBe("44");
		expect(valueFor("Learning step")).toBe("2");
	});

	it("Should show a placeholder for the interval and learning step when the card has no review", async () => {
		// Arrange

		const details = makeDetails(null);

		// Act

		renderWithProviders(
			<ReviewDetails element={cardElement} details={details} />,
		);
		await act(() => Promise.resolve());

		// Assert

		expect(valueFor("Interval (days)")).toBe("—");
		expect(valueFor("Learning step")).toBe("—");
	});
});
