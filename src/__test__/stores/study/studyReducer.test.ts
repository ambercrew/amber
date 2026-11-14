import studyReducer, {
	learningAssetSkipped,
	elementsDropped,
	answerShown,
	cardGraded,
	elementRequeued,
	newlyDueElementsAdded,
	learningAssetAdvanced,
	learningAssetFinished,
	sessionAdvanced,
	sessionElementShown,
	sessionLeft,
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
	totalCount: 0,
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
		expect(actual.startedAt).toBe(actual.shownAt);
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
			summary: {
				cards: 4,
				learningAssets: 1,
				extracts: 1,
				finished: 2,
				endedEarly: false,
				durationMs: 0,
			},
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

	describe("elementRequeued", () => {
		it("Should move the card later in the queue without removing it", () => {
			// Arrange

			const queue = Array.from({ length: 10 }, (_, i) =>
				queueItem("card", `${i}`),
			);
			const state: StudyState = { ...BASE_STATE, queue };

			// Act

			const actual = studyReducer(
				state,
				elementRequeued({ elementId: { type: "card", id: "0" } }),
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
				elementRequeued({ elementId: { type: "card", id: "0" } }),
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
				elementRequeued({ elementId: { type: "card", id: "missing" } }),
			);

			// Assert

			expect(actual.queue).toEqual(queue);
		});
	});

	describe("newlyDueElementsAdded", () => {
		const ids = (state: StudyState) =>
			state.queue.map(item => item.elementId.id);

		it("Should insert new elements in priority order between queued ones when they become due", () => {
			// Arrange

			const state: StudyState = {
				...BASE_STATE,
				status: "studying",
				queue: [queueItem("card", "a"), queueItem("card", "c")],
				totalCount: 2,
			};
			const due = ["a", "b", "c", "d"].map(id => queueItem("card", id));

			// Act

			const actual = studyReducer(
				state,
				newlyDueElementsAdded({ due, currentIndex: 0 }),
			);

			// Assert

			expect(ids(actual)).toEqual(["a", "b", "c", "d"]);
			expect(actual.totalCount).toBe(4);
		});

		it("Should insert after the current element when the new element outranks it", () => {
			// Arrange

			const state: StudyState = {
				...BASE_STATE,
				status: "studying",
				queue: [queueItem("card", "b"), queueItem("card", "c")],
				totalCount: 2,
			};
			const due = ["x", "y", "b", "c"].map(id => queueItem("card", id));

			// Act

			const actual = studyReducer(
				state,
				newlyDueElementsAdded({ due, currentIndex: 0 }),
			);

			// Assert

			expect(ids(actual)).toEqual(["b", "x", "y", "c"]);
		});

		it("Should insert an element once when it is repeated in due", () => {
			// Arrange

			const state: StudyState = {
				...BASE_STATE,
				status: "studying",
				queue: [queueItem("card", "a")],
				totalCount: 1,
			};
			const due = ["a", "b", "b"].map(id => queueItem("card", id));

			// Act

			const actual = studyReducer(
				state,
				newlyDueElementsAdded({ due, currentIndex: 0 }),
			);

			// Assert

			expect(ids(actual)).toEqual(["a", "b"]);
			expect(actual.totalCount).toBe(2);
		});

		it("Should leave the queue unchanged when no session is running", () => {
			// Arrange

			const state: StudyState = {
				...BASE_STATE,
				queue: [queueItem("card", "a")],
			};

			// Act

			const actual = studyReducer(
				state,
				newlyDueElementsAdded({
					due: [queueItem("card", "a"), queueItem("card", "b")],
					currentIndex: 0,
				}),
			);

			// Assert

			expect(ids(actual)).toEqual(["a"]);
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
					nextElementId: { type: "card", id: "2" },
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
				sessionAdvanced({
					completedElementId: null,
					nextElementId: { type: "card", id: "2" },
				}),
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
					nextElementId: null,
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
				endedEarly: false,
				durationMs: 0,
			});
		});
	});

	it("Should record a summary marked as ended early, with the session's length, when sessionStopped is dispatched after reviews", () => {
		// Arrange

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
		const state: StudyState = {
			...BASE_STATE,
			status: "studying",
			queue: [queueItem("card", "1")],
			counts: { cards: 2, learningAssets: 0, extracts: 1, finished: 0 },
			startedAt: Date.now() - 18 * 60_000,
		};

		// Act

		const actual = studyReducer(state, sessionStopped());

		// Assert

		expect(actual.summary).toEqual({
			cards: 2,
			learningAssets: 0,
			extracts: 1,
			finished: 0,
			endedEarly: true,
			durationMs: 18 * 60_000,
		});
		expect(actual.startedAt).toBeNull();
		vi.useRealTimers();
	});

	it("Should not record a summary when sessionStopped is dispatched before any review", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			status: "studying",
			queue: [queueItem("card", "1")],
		};

		// Act

		const actual = studyReducer(state, sessionStopped());

		// Assert

		expect(actual.summary).toBeNull();
	});

	it("Should reset the session state but keep the queue when sessionStopped is dispatched", () => {
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
		expect(actual.queue).toEqual([queueItem("card", "1")]);
		expect(actual.cardPhase).toBe("question");
		expect(actual.shownAt).toBeNull();
	});

	describe("session clock", () => {
		const CARD_1 = { type: "card" as const, id: "1" };
		const CARD_2 = { type: "card" as const, id: "2" };
		const NOW = new Date("2026-01-01T10:00:00Z").getTime();
		const STUDYING: StudyState = {
			...BASE_STATE,
			status: "studying",
			queue: [queueItem("card", "1"), queueItem("card", "2")],
			shownAt: NOW - 10_000,
			timedElementId: CARD_1,
		};

		beforeEach(() => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(NOW);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("Should mark the session away without stopping the clock when sessionLeft is dispatched", () => {
			// Arrange

			const state = STUDYING;

			// Act

			const actual = studyReducer(state, sessionLeft());

			// Assert

			expect(actual.away).toBe(true);
			expect(actual.shownAt).toBe(NOW - 10_000);
		});

		it("Should not mark the session away when sessionLeft is dispatched while not studying", () => {
			// Arrange

			const state = { ...STUDYING, status: "editing" as const };

			// Act

			const actual = studyReducer(state, sessionLeft());

			// Assert

			expect(actual.away).toBe(false);
		});

		it("Should keep the answer and the running clock when returning to the timed element", () => {
			// Arrange

			const state: StudyState = {
				...STUDYING,
				away: true,
				cardPhase: "answer",
			};

			// Act

			const actual = studyReducer(
				state,
				sessionElementShown({ elementId: CARD_1 }),
			);

			// Assert

			expect(actual.away).toBe(false);
			expect(actual.cardPhase).toBe("answer");
			expect(actual.shownAt).toBe(NOW - 10_000);
		});

		it("Should bank the time spent and ask afresh when shown another element", () => {
			// Arrange

			const state: StudyState = { ...STUDYING, cardPhase: "answer" };

			// Act

			const actual = studyReducer(
				state,
				sessionElementShown({ elementId: CARD_2 }),
			);

			// Assert

			expect(actual.timeSpent).toEqual({ "card:1": 10_000 });
			expect(actual.timedElementId).toEqual(CARD_2);
			expect(actual.shownAt).toBe(NOW);
			expect(actual.cardPhase).toBe("question");
		});

		it("Should resume an element's banked time when shown it again", () => {
			// Arrange

			const state: StudyState = {
				...STUDYING,
				timedElementId: CARD_2,
				timeSpent: { "card:1": 7_000 },
			};

			// Act

			const actual = studyReducer(
				state,
				sessionElementShown({ elementId: CARD_1 }),
			);

			// Assert

			expect(actual.shownAt).toBe(NOW - 7_000);
			expect(actual.timeSpent).toEqual({ "card:2": 10_000 });
		});

		it("Should bank a skipped element's time when sessionAdvanced moves on without completing it", () => {
			// Arrange

			const state = STUDYING;

			// Act

			const actual = studyReducer(
				state,
				sessionAdvanced({
					completedElementId: null,
					nextElementId: CARD_2,
				}),
			);

			// Assert

			expect(actual.timeSpent).toEqual({ "card:1": 10_000 });
			expect(actual.timedElementId).toEqual(CARD_2);
		});

		it("Should drop a completed element's time when sessionAdvanced moves on", () => {
			// Arrange

			const state = STUDYING;

			// Act

			const actual = studyReducer(
				state,
				sessionAdvanced({
					completedElementId: CARD_1,
					nextElementId: CARD_2,
				}),
			);

			// Assert

			expect(actual.timeSpent).toEqual({});
		});

		it("Should not bank time for the timed element when it has left the queue", () => {
			// Arrange

			const state: StudyState = {
				...STUDYING,
				away: true,
				queue: [queueItem("card", "2")],
			};

			// Act

			const actual = studyReducer(
				state,
				sessionElementShown({ elementId: CARD_2 }),
			);

			// Assert

			expect(actual.timeSpent).toEqual({});
			expect(actual.timedElementId).toEqual(CARD_2);
		});

		it("Should restart the clock when cardGraded logs the time so far", () => {
			// Arrange

			const state = STUDYING;

			// Act

			const actual = studyReducer(state, cardGraded());

			// Assert

			expect(actual.shownAt).toBe(NOW);
		});

		it("Should clear being away and the banked time when sessionStopped is dispatched", () => {
			// Arrange

			const state: StudyState = {
				...STUDYING,
				away: true,
				timeSpent: { "card:2": 3_000 },
			};

			// Act

			const actual = studyReducer(state, sessionStopped());

			// Assert

			expect(actual.away).toBe(false);
			expect(actual.timeSpent).toEqual({});
			expect(actual.timedElementId).toBeNull();
		});
	});

	it("Should clear the summary when summaryDismissed is dispatched", () => {
		// Arrange

		const state: StudyState = {
			...BASE_STATE,
			summary: {
				cards: 1,
				learningAssets: 0,
				extracts: 0,
				finished: 0,
				endedEarly: false,
				durationMs: 0,
			},
		};

		// Act

		const actual = studyReducer(state, summaryDismissed());

		// Assert

		expect(actual.summary).toBeNull();
	});

	describe("long queues", () => {
		const QUEUE = [
			queueItem("card", "a"),
			queueItem("card", "b"),
			queueItem("card", "c"),
			queueItem("card", "d"),
		];
		const STUDYING: StudyState = {
			...BASE_STATE,
			status: "studying",
			queue: QUEUE,
			totalCount: QUEUE.length,
		};
		const ids = (state: StudyState) =>
			state.queue.map(item => item.elementId.id);

		it("Should put a new element before the next queued one when it is due between two", () => {
			// Arrange

			const due = [
				QUEUE[0],
				QUEUE[1],
				queueItem("card", "new"),
				QUEUE[2],
			];

			// Act

			const actual = studyReducer(
				STUDYING,
				newlyDueElementsAdded({ due, currentIndex: 0 }),
			);

			// Assert

			expect(ids(actual)).toEqual(["a", "b", "new", "c", "d"]);
			expect(actual.totalCount).toBe(5);
		});

		it("Should keep new elements in order at the end when nothing queued follows them", () => {
			// Arrange

			const due = [
				...QUEUE,
				queueItem("card", "x"),
				queueItem("card", "y"),
			];

			// Act

			const actual = studyReducer(
				STUDYING,
				newlyDueElementsAdded({ due, currentIndex: 0 }),
			);

			// Assert

			expect(ids(actual)).toEqual(["a", "b", "c", "d", "x", "y"]);
		});

		it("Should never put a new element before the current one", () => {
			// Arrange

			const due = [queueItem("card", "new"), ...QUEUE];

			// Act

			const actual = studyReducer(
				STUDYING,
				newlyDueElementsAdded({ due, currentIndex: 2 }),
			);

			// Assert

			expect(ids(actual)).toEqual(["a", "b", "c", "new", "d"]);
		});

		it("Should keep the same queue when nothing new is due", () => {
			// Act

			const actual = studyReducer(
				STUDYING,
				newlyDueElementsAdded({ due: QUEUE, currentIndex: 0 }),
			);

			// Assert

			expect(actual.queue).toBe(STUDYING.queue);
		});

		it("Should drop pending elements but keep the current one when both are dropped", () => {
			// Arrange

			const payload = {
				elementIds: [QUEUE[1].elementId, QUEUE[2].elementId],
				currentElementId: QUEUE[1].elementId,
			};

			// Act

			const actual = studyReducer(STUDYING, elementsDropped(payload));

			// Assert

			expect(ids(actual)).toEqual(["a", "b", "d"]);
			expect(actual.totalCount).toBe(3);
		});

		it("Should move a skipped element to the end when it is skipped", () => {
			// Act

			const actual = studyReducer(
				STUDYING,
				learningAssetSkipped({ elementId: QUEUE[1].elementId }),
			);

			// Assert

			expect(ids(actual)).toEqual(["a", "c", "d", "b"]);
		});
	});
});
