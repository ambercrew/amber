import { setupStore } from "../../../stores/store";
import { StudyState } from "../../../stores/study/studyReducer";
import {
	selectStudyReturnItem,
	selectStudySessionElement,
} from "../../../stores/study/studySelectors";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";

const CARD = { type: "card" as const, id: "1" };
const OTHER = { type: "card" as const, id: "2" };

const STUDYING: StudyState = {
	status: "studying",
	queue: [
		{ elementId: CARD, title: "Card 1" },
		{ elementId: OTHER, title: "Card 2" },
	],
	totalCount: 2,
	cardPhase: "question",
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
	studyScope: null,
	away: false,
	timedElementId: null,
	timeSpent: {},
	startedAt: null,
};

const VIEWED_CARD: AnyElementDto = {
	type: "card",
	data: {
		meta: {
			elementId: CARD,
			name: "Card 1",
			parent: null,
			position: "0",
			tags: [],
			createdAt: "2024-01-01T00:00:00Z",
			modifiedAt: "2024-01-01T00:00:00Z",
			nameSource: "manual",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
		front: "Front",
		back: "Back",
	},
};

function stateWith(study: StudyState) {
	return setupStore({
		study,
		elements: {
			tree: [],
			isLoading: false,
			error: null,
			currentElement: VIEWED_CARD,
			zoomOwnedByCurrentView: false,
		},
	}).getState();
}

describe("selectStudySessionElement", () => {
	it("Should return the element under review when it's the one on screen", () => {
		// Arrange

		const state = stateWith({ ...STUDYING, timedElementId: CARD });

		// Act

		const actual = selectStudySessionElement(state);

		// Assert

		expect(actual).toEqual(CARD);
	});

	it("Should return null when the element on screen is another queued one still waiting to be replaced", () => {
		// Arrange

		const state = stateWith({ ...STUDYING, timedElementId: OTHER });

		// Act

		const actual = selectStudySessionElement(state);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when editing even though the viewed element is in the preview queue", () => {
		// Arrange

		const state = stateWith({ ...STUDYING, status: "editing" });

		// Act

		const actual = selectStudySessionElement(state);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when the user is away from the session", () => {
		// Arrange

		const state = stateWith({
			...STUDYING,
			away: true,
			timedElementId: CARD,
		});

		// Act

		const actual = selectStudySessionElement(state);

		// Assert

		expect(actual).toBeNull();
	});
});

describe("selectStudyReturnItem", () => {
	it("Should return the element left when it's still queued", () => {
		// Arrange

		const state = stateWith({
			...STUDYING,
			away: true,
			timedElementId: OTHER,
		});

		// Act

		const actual = selectStudyReturnItem(state);

		// Assert

		expect(actual?.elementId).toEqual(OTHER);
	});

	it("Should return the front of the queue when the element left is gone", () => {
		// Arrange

		const state = stateWith({
			...STUDYING,
			away: true,
			timedElementId: { type: "card", id: "gone" },
		});

		// Act

		const actual = selectStudyReturnItem(state);

		// Assert

		expect(actual?.elementId).toEqual(CARD);
	});

	it("Should return null when the user isn't away from the session", () => {
		// Arrange

		const state = stateWith(STUDYING);

		// Act

		const actual = selectStudyReturnItem(state);

		// Assert

		expect(actual).toBeNull();
	});
});
