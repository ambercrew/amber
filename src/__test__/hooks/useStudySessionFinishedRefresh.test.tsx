import { act, renderHook, waitFor } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { MantineProvider } from "@mantine/core";
import { useStudySessionFinishedRefresh } from "../../hooks/useStudySessionFinishedRefresh";
import { useElementParams } from "../../hooks/useElementParams";
import {
	elementExists,
	getElementById,
	getElementDetails,
} from "../../api/elements/api/elementsApi";
import { setupStore } from "../../stores/store";
import { AnyElementDto } from "../../api/elements/dto/anyElementDto";
import { ElementDetailsResponseDto } from "../../api/elements/dto/elementDetailsDto";
import { StudyProfileDto } from "../../api/study/dto/studyProfileDto";
import { CardReviewDto } from "../../api/study/dto/cardReviewDto";
import { STUDY_SESSION_FINISHED } from "../../types/events/studySessionFinishedEvent";

vi.mock(import("../../hooks/useElementParams"));
vi.mock(import("../../api/elements/api/elementsApi"));

const CARD_ELEMENT_ID = { type: "card" as const, id: "card-1" };

const CARD_ELEMENT: AnyElementDto = {
	type: "card",
	data: {
		meta: {
			elementId: CARD_ELEMENT_ID,
			name: "Card 1",
			position: "0",
			parent: null,
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

const PROFILE: StudyProfileDto = {
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

const CARD_REVIEW: CardReviewDto = {
	cardId: CARD_ELEMENT_ID.id,
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

const DETAILS: ElementDetailsResponseDto = {
	bibliographicalSource: null,
	derivedFromName: null,
	cardReview: CARD_REVIEW,
	learningAssetReview: null,
	effectiveProfile: {
		profile: PROFILE,
		source: "default",
		inheritedFrom: null,
	},
	profiles: [],
	inheritedProfileName: null,
	priority: { rank: 3, total: 5, percentage: 50 },
};

function makeStore() {
	return setupStore();
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
	return function Wrapper({ children }: PropsWithChildren) {
		return (
			<MantineProvider>
				<MemoryRouter>
					<Provider store={store}>{children}</Provider>
				</MemoryRouter>
			</MantineProvider>
		);
	};
}

describe("useStudySessionFinishedRefresh", () => {
	it("Should reload the current element and its details when a study session finishes", async () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue(CARD_ELEMENT_ID);
		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(CARD_ELEMENT);
		vi.mocked(getElementDetails).mockResolvedValue(DETAILS);
		const store = makeStore();

		renderHook(() => useStudySessionFinishedRefresh(), {
			wrapper: makeWrapper(store),
		});

		// Act

		act(() => {
			window.dispatchEvent(new Event(STUDY_SESSION_FINISHED));
		});

		// Assert

		await waitFor(() => {
			expect(store.getState().elements.currentElement).toEqual(
				CARD_ELEMENT,
			);
			expect(store.getState().elementDetails.details).toEqual(DETAILS);
		});
	});

	it("Should do nothing when there is no element currently open", () => {
		// Arrange

		vi.mocked(useElementParams).mockReturnValue(null);
		const store = makeStore();

		renderHook(() => useStudySessionFinishedRefresh(), {
			wrapper: makeWrapper(store),
		});

		// Act

		act(() => {
			window.dispatchEvent(new Event(STUDY_SESSION_FINISHED));
		});

		// Assert

		expect(elementExists).not.toHaveBeenCalled();
	});
});
