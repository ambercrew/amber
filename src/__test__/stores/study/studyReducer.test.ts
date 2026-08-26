import studyReducer, {
	answerShown,
	cardGraded,
	cardRequeued,
	learningAssetAdvanced,
	learningAssetFinished,
	sessionAdvanced,
	sessionStarted,
	sessionStopped,
	summaryDismissed,
	StudyState,
} from "../../../stores/study/studyReducer";
import { DueElementDto } from "../../../api/study/dto/dueElementDto";

function queueItem(type: "card" | "learningAsset", id: string): DueElementDto {
	return { elementId: { type, id }, title: `${type} ${id}` };
}

const BASE_STATE: StudyState = {
	status: "editing",
	queue: [],
	cardPhase: "question",
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
};

describe("studyReducer", () => {
	it("Should start a studying session when sessionStarted is dispatched", () => {
		// Arrange

		const queue = [queueItem("card", "1"), queueItem("learningAsset", "2")];

		// Act

		const actual = studyReducer(BASE_STATE, sessionStarted(queue));

		// Assert

		expect(actual.status).toBe("studying");
		expect(actual.queue).toEqual(queue);
		expect(actual.cardPhase).toBe("question");
		expect(actual.shownAt).not.toBeNull();
		expect(actual.counts).toEqual({
			cards: 0,
			learningAssets: 0,
			extracts: 0,
			finished: 0,
		});
		expect(actual.summary).toBeNull();
	});

	it("Should reset counts and summary when starting a session while one already has progress", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			counts: { cards: 4, learningAssets: 1, extracts: 1, finished: 2 },
			summary: { cards: 4, learningAssets: 1, extracts: 1, finished: 2 },
		};
		const queue = [queueItem("card", "1")];

		// Act

		const actual = studyReducer(state, sessionStarted(queue));

		// Assert

		expect(actual.counts).toEqual({
			cards: 0,
			learningAssets: 0,
			extracts: 0,
			finished: 0,
		});
		expect(actual.summary).toBeNull();
	});

	it("Should reveal the answer when answerShown is dispatched", () => {
		// Arrange

		const state: StudyState = { ...BASE_STATE, cardPhase: "question" };

		// Act

		const actual = studyReducer(state, answerShown());

		// Assert

		expect(actual.cardPhase).toBe("answer");
	});

	it("Should increment the card count when cardGraded is dispatched", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			counts: { cards: 2, learningAssets: 0, extracts: 0, finished: 0 },
		};

		// Act

		const actual = studyReducer(state, cardGraded());

		// Assert

		expect(actual.counts.cards).toBe(3);
	});

	it("Should increment the learning asset count when learningAssetAdvanced is dispatched for a learning asset", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			counts: { cards: 0, learningAssets: 1, extracts: 0, finished: 0 },
		};

		// Act

		const actual = studyReducer(
			state,
			learningAssetAdvanced({ elementType: "learningAsset" }),
		);

		// Assert

		expect(actual.counts.learningAssets).toBe(2);
		expect(actual.counts.extracts).toBe(0);
	});

	it("Should increment the extract count when learningAssetAdvanced is dispatched for an extract", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			counts: { cards: 0, learningAssets: 1, extracts: 1, finished: 0 },
		};

		// Act

		const actual = studyReducer(
			state,
			learningAssetAdvanced({ elementType: "extract" }),
		);

		// Assert

		expect(actual.counts.extracts).toBe(2);
		expect(actual.counts.learningAssets).toBe(1);
	});

	it("Should increment the finished and learning asset counts when learningAssetFinished is dispatched for a learning asset", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 1 },
		};

		// Act

		const actual = studyReducer(
			state,
			learningAssetFinished({ elementType: "learningAsset" }),
		);

		// Assert

		expect(actual.counts.finished).toBe(2);
		expect(actual.counts.learningAssets).toBe(1);
		expect(actual.counts.extracts).toBe(0);
	});

	it("Should increment the finished and extract counts when learningAssetFinished is dispatched for an extract", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 1 },
		};

		// Act

		const actual = studyReducer(
			state,
			learningAssetFinished({ elementType: "extract" }),
		);

		// Assert

		expect(actual.counts.finished).toBe(2);
		expect(actual.counts.extracts).toBe(1);
		expect(actual.counts.learningAssets).toBe(0);
	});

	describe("cardRequeued", () => {
		it("Should move the card later in the queue without removing it", () => {
			// Arrange

			const queue = Array.from({ length: 10 }, (_, i) =>
				queueItem("card", `${i}`),
			);
			const state: StudyState = { ...BASE_STATE, queue };

			// Act

			const actual = studyReducer(
				state,
				cardRequeued({ elementId: { type: "card", id: "0" } }),
			);

			// Assert

			expect(actual.queue).toHaveLength(10);
			expect(actual.queue.map(item => item.elementId.id)).toEqual([
				"1",
				"2",
				"3",
				"4",
				"5",
				"6",
				"7",
				"0",
				"8",
				"9",
			]);
		});

		it("Should clamp the reinsertion position to the end of a short queue", () => {
			// Arrange

			const queue = [
				queueItem("card", "0"),
				queueItem("card", "1"),
				queueItem("card", "2"),
			];
			const state: StudyState = { ...BASE_STATE, queue };

			// Act

			const actual = studyReducer(
				state,
				cardRequeued({ elementId: { type: "card", id: "0" } }),
			);

			// Assert

			expect(actual.queue.map(item => item.elementId.id)).toEqual([
				"1",
				"2",
				"0",
			]);
		});

		it("Should do nothing when the card is not in the queue", () => {
			// Arrange

			const queue = [queueItem("card", "1")];
			const state: StudyState = { ...BASE_STATE, queue };

			// Act

			const actual = studyReducer(
				state,
				cardRequeued({ elementId: { type: "card", id: "missing" } }),
			);

			// Assert

			expect(actual.queue).toEqual(queue);
		});
	});

	describe("sessionAdvanced", () => {
		it("Should remove the completed element and continue the session when more elements remain", () => {
			// Arrange

			const queue = [queueItem("card", "1"), queueItem("card", "2")];
			const state: StudyState = {
				...BASE_STATE,
				status: "studying",
				queue,
				cardPhase: "answer",
			};

			// Act

			const actual = studyReducer(
				state,
				sessionAdvanced({
					completedElementId: { type: "card", id: "1" },
				}),
			);

			// Assert

			expect(actual.status).toBe("studying");
			expect(actual.queue.map(item => item.elementId.id)).toEqual(["2"]);
			expect(actual.cardPhase).toBe("question");
			expect(actual.shownAt).not.toBeNull();
			expect(actual.summary).toBeNull();
		});

		it("Should not remove anything when completedElementId is null", () => {
			// Arrange

			const queue = [queueItem("card", "1"), queueItem("card", "2")];
			const state: StudyState = {
				...BASE_STATE,
				status: "studying",
				queue,
			};

			// Act

			const actual = studyReducer(
				state,
				sessionAdvanced({ completedElementId: null }),
			);

			// Assert

			expect(actual.queue).toEqual(queue);
			expect(actual.status).toBe("studying");
		});

		it("Should end the session and record the summary once the queue is empty", () => {
			// Arrange

			const queue = [queueItem("card", "1")];
			const state: StudyState = {
				...BASE_STATE,
				status: "studying",
				queue,
				counts: {
					cards: 3,
					learningAssets: 1,
					extracts: 1,
					finished: 2,
				},
			};

			// Act

			const actual = studyReducer(
				state,
				sessionAdvanced({
					completedElementId: { type: "card", id: "1" },
				}),
			);

			// Assert

			expect(actual.status).toBe("editing");
			expect(actual.queue).toEqual([]);
			expect(actual.summary).toEqual({
				cards: 3,
				learningAssets: 1,
				extracts: 1,
				finished: 2,
			});
		});
	});

	it("Should reset the session state when sessionStopped is dispatched", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			status: "studying",
			queue: [queueItem("card", "1")],
			cardPhase: "answer",
			shownAt: Date.now(),
		};

		// Act

		const actual = studyReducer(state, sessionStopped());

		// Assert

		expect(actual.status).toBe("editing");
		expect(actual.queue).toEqual([]);
		expect(actual.cardPhase).toBe("question");
		expect(actual.shownAt).toBeNull();
	});

	it("Should clear the summary when summaryDismissed is dispatched", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			summary: { cards: 1, learningAssets: 0, extracts: 0, finished: 0 },
		};

		// Act

		const actual = studyReducer(state, summaryDismissed());

		// Assert

		expect(actual.summary).toBeNull();
	});
});
