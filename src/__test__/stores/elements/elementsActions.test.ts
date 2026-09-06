import { setupStore } from "../../../stores/store";
import { loadCurrentElementAction } from "../../../stores/elements/elementsActions";
import {
	elementExists,
	getElementById,
	getElementDetails,
} from "../../../api/elements/api/elementsApi";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { ElementDetailsResponseDto } from "../../../api/elements/dto/elementDetailsDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";

vi.mock(import("../../../api/elements/api/elementsApi"));

const ELEMENT_ID = { type: "card" as const, id: "card-1" };

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

const CARD_ELEMENT: AnyElementDto = {
	type: "card",
	data: {
		meta: {
			elementId: ELEMENT_ID,
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

const DETAILS: ElementDetailsResponseDto = {
	bibliographicalSource: null,
	derivedFromName: null,
	cardReview: null,
	learningAssetReview: null,
	effectiveProfile: {
		profile: PROFILE,
		source: "default",
		inheritedFrom: null,
	},
	profiles: [PROFILE],
	inheritedProfileName: null,
	priority: { rank: 1, total: 1, percentage: 0 },
};

describe("loadCurrentElementAction", () => {
	it("Should resolve to false and leave currentElement untouched when the element does not exist", async () => {
		// Arrange

		vi.mocked(elementExists).mockResolvedValue(false);
		const store = setupStore();

		// Act

		const loaded = await store.dispatch(
			loadCurrentElementAction(ELEMENT_ID),
		);

		// Assert

		expect(loaded).toBe(false);
		expect(store.getState().elements.currentElement).toBeNull();
		expect(getElementById).not.toHaveBeenCalled();
	});

	it("Should set currentElement and elementDetails and resolve to true when the element exists", async () => {
		// Arrange

		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(CARD_ELEMENT);
		vi.mocked(getElementDetails).mockResolvedValue(DETAILS);
		const store = setupStore();

		// Act

		const loaded = await store.dispatch(
			loadCurrentElementAction(ELEMENT_ID),
		);

		// Assert

		expect(loaded).toBe(true);
		expect(store.getState().elements.currentElement).toEqual(CARD_ELEMENT);
		expect(store.getState().elementDetails.details).toEqual(DETAILS);
	});
});
