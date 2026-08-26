import { NavigateFunction } from "react-router";
import { setupStore } from "../../../stores/store";
import {
	finishLearningAssetAction,
	gradeCardAction,
	nextLearningAssetAction,
	skipLearningAssetAction,
	startStudySession,
} from "../../../stores/study/studyActions";
import { StudyState } from "../../../stores/study/studyReducer";
import {
	finishLearningAsset,
	getDueElements,
	registerCardReview,
	nextLearningAsset,
} from "../../../api/study/api/studyApi";
import { DueElementDto } from "../../../api/study/dto/dueElementDto";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { ElementsState } from "../../../stores/elements/elementsReducer";
import { CardReviewDto } from "../../../api/study/dto/cardReviewDto";
import { LearningAssetReviewDto } from "../../../api/study/dto/learningAssetReviewDto";

vi.mock(import("../../../api/study/api/studyApi.ts"));

const META_FIELDS = {
	parent: null,
	position: "0",
	tags: [],
	createdAt: "2024-01-01T00:00:00Z",
	modifiedAt: "2024-01-01T00:00:00Z",
	bibliographicalSourceId: null,
	derivedFrom: null,
};

function cardQueueItem(id: string): DueElementDto {
	return { elementId: { type: "card", id }, title: `Card ${id}` };
}

function learningAssetQueueItem(id: string): DueElementDto {
	return {
		elementId: { type: "learningAsset", id },
		title: `LearningAsset ${id}`,
	};
}

function extractQueueItem(id: string): DueElementDto {
	return {
		elementId: { type: "extract", id },
		title: `Extract ${id}`,
	};
}

function cardElement(id: string): AnyElementDto {
	return {
		type: "card",
		data: {
			meta: {
				elementId: { type: "card", id },
				name: `Card ${id}`,
				...META_FIELDS,
			},
			front: "Front",
			back: "Back",
		},
	};
}

function learningAssetElement(id: string): AnyElementDto {
	return {
		type: "learningAsset",
		data: {
			meta: {
				elementId: { type: "learningAsset", id },
				name: `LearningAsset ${id}`,
				...META_FIELDS,
			},
			readPoint: { split: 0, block: 0 },
			intervalMultiplier: 1.2,
		},
	};
}

function extractElement(id: string): AnyElementDto {
	return {
		type: "extract",
		data: {
			meta: {
				elementId: { type: "extract", id },
				name: `Extract ${id}`,
				...META_FIELDS,
			},
			content: "Content",
			intervalMultiplier: 1.2,
		},
	};
}

function makeCardReview(due: string): CardReviewDto {
	return {
		cardId: "1",
		due,
		stability: 1,
		difficulty: 1,
		reps: 1,
		lapses: 0,
		state: "review",
		lastReviewed: null,
		scheduledDays: 1,
		learningSteps: 0,
	};
}

// The review the caller schedules with ts-fsrs before dispatching; the action
// only forwards it, so its contents don't affect these tests.
const SCHEDULED_REVIEW = makeCardReview("2024-02-01T00:00:00Z");

const LEARNING_ASSET_REVIEW: LearningAssetReviewDto = {
	elementId: { type: "learningAsset", id: "1" },
	due: "2024-02-01T00:00:00Z",
	intervalDays: 1,
	lastReviewed: "2024-01-01T00:00:00Z",
	finishedAt: null,
};

const BASE_STUDY_STATE: StudyState = {
	status: "studying",
	queue: [],
	cardPhase: "question",
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
};

function elementsStateFor(currentElement: AnyElementDto): ElementsState {
	return { tree: [], isLoading: false, error: null, currentElement };
}

function inMs(offsetMs: number): string {
	return new Date(Date.now() + offsetMs).toISOString();
}

const IN_TWO_DAYS = () => inMs(2 * 24 * 3_600_000);
const IN_ONE_MINUTE = () => inMs(60_000);

describe("startStudySession", () => {
	it("Should not start a session when there are no due elements", async () => {
		// Arrange

		vi.mocked(getDueElements).mockResolvedValue([]);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore();

		// Act

		const started = await store.dispatch(startStudySession(navigate));

		// Assert

		expect(started).toBe(false);
		expect(store.getState().study.status).toBe("editing");
		expect(navigate).not.toHaveBeenCalled();
	});

	it("Should start a session and navigate to the first due element", async () => {
		// Arrange

		const queue = [cardQueueItem("1"), learningAssetQueueItem("2")];
		vi.mocked(getDueElements).mockResolvedValue(queue);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore();

		// Act

		const started = await store.dispatch(startStudySession(navigate));

		// Assert

		expect(started).toBe(true);
		expect(store.getState().study.status).toBe("studying");
		expect(store.getState().study.queue).toEqual(queue);
		expect(navigate).toHaveBeenCalledWith(
			"/card/1",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});
});

describe("gradeCardAction", () => {
	it("Should remove the graded card and move forward to the next element", async () => {
		// Arrange

		vi.mocked(registerCardReview).mockResolvedValue(
			makeCardReview(IN_TWO_DAYS()),
		);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [
					cardQueueItem("1"),
					cardQueueItem("2"),
					cardQueueItem("3"),
				],
			},
			elements: elementsStateFor(cardElement("1")),
		});

		// Act

		await store.dispatch(
			gradeCardAction("1", SCHEDULED_REVIEW, "good", navigate),
		);

		// Assert

		const state = store.getState().study;
		expect(state.counts.cards).toBe(1);
		expect(state.queue.map(item => item.elementId.id)).toEqual(["2", "3"]);
		expect(navigate).toHaveBeenCalledWith(
			"/card/2",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});

	it("Should requeue the card instead of removing it when due again within the session horizon", async () => {
		// Arrange

		vi.mocked(registerCardReview).mockResolvedValue(
			makeCardReview(IN_ONE_MINUTE()),
		);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const queue = Array.from({ length: 10 }, (_, i) =>
			cardQueueItem(`${i}`),
		);
		const store = setupStore({
			study: { ...BASE_STUDY_STATE, queue },
			elements: elementsStateFor(cardElement("0")),
		});

		// Act

		await store.dispatch(
			gradeCardAction("0", SCHEDULED_REVIEW, "again", navigate),
		);

		// Assert

		const state = store.getState().study;
		expect(state.queue).toHaveLength(10);
		expect(state.queue.map(item => item.elementId.id)).toContain("0");
		expect(navigate).toHaveBeenCalledWith(
			"/card/1",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});

	it("Should wrap around to the front of the queue when the last element is completed and others remain", async () => {
		// Arrange

		vi.mocked(registerCardReview).mockResolvedValue(
			makeCardReview(IN_TWO_DAYS()),
		);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [
					cardQueueItem("1"),
					cardQueueItem("2"),
					cardQueueItem("3"),
				],
			},
			elements: elementsStateFor(cardElement("3")),
		});

		// Act

		await store.dispatch(
			gradeCardAction("3", SCHEDULED_REVIEW, "good", navigate),
		);

		// Assert

		const state = store.getState().study;
		expect(state.queue.map(item => item.elementId.id)).toEqual(["1", "2"]);
		expect(navigate).toHaveBeenCalledWith(
			"/card/1",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});

	it("Should end the session and set the summary once the last pending element is completed", async () => {
		// Arrange

		vi.mocked(registerCardReview).mockResolvedValue(
			makeCardReview(IN_TWO_DAYS()),
		);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: { ...BASE_STUDY_STATE, queue: [cardQueueItem("1")] },
			elements: elementsStateFor(cardElement("1")),
		});

		// Act

		await store.dispatch(
			gradeCardAction("1", SCHEDULED_REVIEW, "good", navigate),
		);

		// Assert

		const state = store.getState().study;
		expect(state.status).toBe("editing");
		expect(state.queue).toEqual([]);
		expect(state.summary).toEqual({
			cards: 1,
			learningAssets: 0,
			extracts: 0,
			finished: 0,
		});
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe("nextLearningAssetAction", () => {
	it("Should increment the learning asset count and advance to the next element", async () => {
		// Arrange

		vi.mocked(nextLearningAsset).mockResolvedValue(LEARNING_ASSET_REVIEW);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [
					learningAssetQueueItem("1"),
					learningAssetQueueItem("2"),
				],
			},
			elements: elementsStateFor(learningAssetElement("1")),
		});

		// Act

		await store.dispatch(
			nextLearningAssetAction(
				{ type: "learningAsset", id: "1" },
				navigate,
			),
		);

		// Assert

		const state = store.getState().study;
		expect(state.counts.learningAssets).toBe(1);
		expect(state.counts.extracts).toBe(0);
		expect(state.queue.map(item => item.elementId.id)).toEqual(["2"]);
		expect(navigate).toHaveBeenCalledWith(
			"/learningAsset/2",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});

	it("Should increment the extract count instead of the learning asset count when advancing an extract", async () => {
		// Arrange

		vi.mocked(nextLearningAsset).mockResolvedValue(LEARNING_ASSET_REVIEW);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [extractQueueItem("1"), extractQueueItem("2")],
			},
			elements: elementsStateFor(extractElement("1")),
		});

		// Act

		await store.dispatch(
			nextLearningAssetAction({ type: "extract", id: "1" }, navigate),
		);

		// Assert

		const state = store.getState().study;
		expect(state.counts.extracts).toBe(1);
		expect(state.counts.learningAssets).toBe(0);
		expect(state.queue.map(item => item.elementId.id)).toEqual(["2"]);
		expect(navigate).toHaveBeenCalledWith(
			"/extract/2",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});
});

describe("skipLearningAssetAction", () => {
	it("Should move the skipped learning asset to the end of the queue and advance without incrementing any counts", () => {
		// Arrange

		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [
					learningAssetQueueItem("1"),
					learningAssetQueueItem("2"),
					learningAssetQueueItem("3"),
				],
			},
			elements: elementsStateFor(learningAssetElement("1")),
		});

		// Act

		store.dispatch(
			skipLearningAssetAction(
				{ type: "learningAsset", id: "1" },
				navigate,
			),
		);

		// Assert

		const state = store.getState().study;
		expect(state.queue.map(item => item.elementId.id)).toEqual([
			"2",
			"3",
			"1",
		]);
		expect(state.counts.learningAssets).toBe(0);
		expect(state.counts.finished).toBe(0);
		expect(navigate).toHaveBeenCalledWith(
			"/learningAsset/2",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});

	it("Should keep the session active and revisit the same element when skipping the only learning asset in the queue", () => {
		// Arrange

		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [learningAssetQueueItem("1")],
			},
			elements: elementsStateFor(learningAssetElement("1")),
		});

		// Act

		store.dispatch(
			skipLearningAssetAction(
				{ type: "learningAsset", id: "1" },
				navigate,
			),
		);

		// Assert

		const state = store.getState().study;
		expect(state.status).toBe("studying");
		expect(state.queue.map(item => item.elementId.id)).toEqual(["1"]);
		expect(navigate).toHaveBeenCalledWith(
			"/learningAsset/1",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});
});

describe("finishLearningAssetAction", () => {
	it("Should increment the finished count and advance to the next element", async () => {
		// Arrange

		vi.mocked(finishLearningAsset).mockResolvedValue(LEARNING_ASSET_REVIEW);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [
					learningAssetQueueItem("1"),
					learningAssetQueueItem("2"),
				],
			},
			elements: elementsStateFor(learningAssetElement("1")),
		});

		// Act

		await store.dispatch(
			finishLearningAssetAction(
				{ type: "learningAsset", id: "1" },
				navigate,
			),
		);

		// Assert

		const state = store.getState().study;
		expect(state.counts.finished).toBe(1);
		expect(state.counts.learningAssets).toBe(1);
		expect(state.queue.map(item => item.elementId.id)).toEqual(["2"]);
		expect(navigate).toHaveBeenCalledWith(
			"/learningAsset/2",
			expect.objectContaining({ state: { studySessionNav: true } }),
		);
	});

	it("Should include the finished element in the session summary when it is the last element in the queue", async () => {
		// Arrange

		vi.mocked(finishLearningAsset).mockResolvedValue(LEARNING_ASSET_REVIEW);
		const navigate = vi.fn() as unknown as NavigateFunction;
		const store = setupStore({
			study: {
				...BASE_STUDY_STATE,
				queue: [extractQueueItem("1")],
			},
			elements: elementsStateFor(extractElement("1")),
		});

		// Act

		await store.dispatch(
			finishLearningAssetAction({ type: "extract", id: "1" }, navigate),
		);

		// Assert

		const state = store.getState().study;
		expect(state.status).toBe("editing");
		expect(state.summary).toEqual({
			cards: 0,
			learningAssets: 0,
			extracts: 1,
			finished: 1,
		});
	});
});
