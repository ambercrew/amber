import { CardReviewDto } from "../../../../api/study/dto/cardReviewDto";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import {
	replayReviews,
	scheduleAllRatings,
} from "../../../../features/Study/utils/cardScheduling";
import { startOfLocalDay } from "../../../../utils/startOfLocalDay";

const NOW = new Date("2024-06-01T12:00:00Z");

const PROFILE: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2024-01-01T00:00:00Z",
	modifiedAt: "2024-01-01T00:00:00Z",
	name: "Default",
	isDefault: true,
	desiredRetention: 0.9,
	// Empty means "use the FSRS defaults".
	fsrsParams: [],
	learningSteps: ["1m", "10m"],
	relearningSteps: ["10m"],
	initialIntervalMultiplier: 1.2,
	initialIntervalDays: 1,
	minIntervalDays: 1,
	priorityInheritancePolicy: {
		placement: { type: "aboveParent" },
		ceilingPercentile: null,
	},
};

const CUSTOM_STEPS_PROFILE: StudyProfileDto = {
	...PROFILE,
	id: "profile-2",
	learningSteps: ["5m", "15m"],
	relearningSteps: ["30m"],
};

const NO_STEPS_PROFILE: StudyProfileDto = {
	...PROFILE,
	id: "profile-3",
	learningSteps: [],
	relearningSteps: [],
};

const NEW_CARD: CardReviewDto = {
	cardId: "card-1",
	due: NOW.toISOString(),
	stability: 0,
	difficulty: 0,
	reps: 0,
	lapses: 0,
	state: "new",
	lastReviewed: null,
	scheduledDays: 0,
	learningSteps: 0,
};

const REVIEW_CARD: CardReviewDto = {
	cardId: "card-1",
	due: NOW.toISOString(),
	stability: 100,
	difficulty: 5,
	reps: 8,
	lapses: 0,
	state: "review",
	lastReviewed: new Date("2024-03-01T12:00:00Z").toISOString(),
	scheduledDays: 92,
	learningSteps: 0,
};

function minutesUntilDue(due: string): number {
	return (new Date(due).getTime() - NOW.getTime()) / 60_000;
}

describe("scheduleAllRatings", () => {
	it("Should keep a new card in learning on its second step when rated Good", () => {
		// Arrange

		const review = NEW_CARD;

		// Act

		const actual = scheduleAllRatings(PROFILE, review, NOW).good;

		// Assert

		expect(actual.state).toBe("learning");
		expect(actual.learningSteps).toBe(1);
		expect(minutesUntilDue(actual.due)).toBe(10);
	});

	it("Should keep a new card on its first step when rated Again", () => {
		// Arrange

		const review = NEW_CARD;

		// Act

		const actual = scheduleAllRatings(PROFILE, review, NOW).again;

		// Assert

		expect(actual.state).toBe("learning");
		expect(minutesUntilDue(actual.due)).toBe(1);
	});

	it("Should send a lapsed review card to a relearning step rather than days out when rated Again", () => {
		// Arrange

		const review = REVIEW_CARD;

		// Act

		const actual = scheduleAllRatings(PROFILE, review, NOW).again;

		// Assert

		expect(actual.state).toBe("relearning");
		expect(actual.lapses).toBe(1);
		expect(minutesUntilDue(actual.due)).toBe(10);
	});

	it("Should make a review card due from the start of its day when rated Good", () => {
		// Arrange

		const review = REVIEW_CARD;

		// Act

		const actual = scheduleAllRatings(PROFILE, review, NOW).good;

		// Assert

		const dueDay = new Date(NOW);
		dueDay.setDate(dueDay.getDate() + actual.scheduledDays);
		expect(actual.state).toBe("review");
		expect(actual.scheduledDays).toBeGreaterThan(1);
		expect(actual.due).toBe(startOfLocalDay(dueDay).toISOString());
	});

	it("Should order the four ratings from the shortest to the longest interval when a review card is graded", () => {
		// Arrange

		const review = REVIEW_CARD;

		// Act

		const actual = scheduleAllRatings(PROFILE, review, NOW);

		// Assert

		const dueTimes = [
			actual.again,
			actual.hard,
			actual.good,
			actual.easy,
		].map(scheduled => new Date(scheduled.due).getTime());
		expect(dueTimes).toEqual([...dueTimes].sort((a, b) => a - b));
	});

	it("Should carry the card id onto every scheduled review", () => {
		// Arrange

		const review = NEW_CARD;

		// Act

		const actual = scheduleAllRatings(PROFILE, review, NOW);

		// Assert

		expect(
			Object.values(actual).map(scheduled => scheduled.cardId),
		).toEqual(["card-1", "card-1", "card-1", "card-1"]);
	});

	it("Should use the profile's learning steps instead of the ts-fsrs defaults when rated Again", () => {
		// Arrange

		const review = NEW_CARD;

		// Act

		const actual = scheduleAllRatings(
			CUSTOM_STEPS_PROFILE,
			review,
			NOW,
		).again;

		// Assert

		expect(actual.state).toBe("learning");
		expect(minutesUntilDue(actual.due)).toBe(5);
	});

	it("Should use the profile's relearning steps instead of the ts-fsrs defaults when a review card is rated Again", () => {
		// Arrange

		const review = REVIEW_CARD;

		// Act

		const actual = scheduleAllRatings(
			CUSTOM_STEPS_PROFILE,
			review,
			NOW,
		).again;

		// Assert

		expect(actual.state).toBe("relearning");
		expect(minutesUntilDue(actual.due)).toBe(30);
	});

	it("Should send a new card straight to review when rated Good with no learning steps", () => {
		// Arrange

		const review = NEW_CARD;

		// Act

		const actual = scheduleAllRatings(NO_STEPS_PROFILE, review, NOW).good;

		// Assert

		expect(actual.state).toBe("review");
		expect(actual.scheduledDays).toBeGreaterThanOrEqual(1);
	});

	it("Should keep a lapsed review card in review days out when rated Again with no relearning steps", () => {
		// Arrange

		const review = REVIEW_CARD;

		// Act

		const actual = scheduleAllRatings(NO_STEPS_PROFILE, review, NOW).again;

		// Assert

		const dueDay = new Date(NOW);
		dueDay.setDate(dueDay.getDate() + actual.scheduledDays);
		expect(actual.state).toBe("review");
		expect(actual.lapses).toBe(1);
		expect(actual.due).toBe(startOfLocalDay(dueDay).toISOString());
	});

	it("Should match grading each review in turn when replaying a review history", () => {
		// Arrange

		const first = new Date("2024-06-01T12:00:00Z");
		const second = new Date("2024-06-01T12:10:00Z");
		const afterFirst = scheduleAllRatings(
			NO_STEPS_PROFILE,
			{ ...NEW_CARD, due: first.toISOString() },
			first,
		).good;
		const expected = scheduleAllRatings(
			NO_STEPS_PROFILE,
			afterFirst,
			second,
		).hard;

		// Act

		const actual = replayReviews(NO_STEPS_PROFILE, "card-1", [
			{ reviewedAt: first.toISOString(), rating: "good" },
			{ reviewedAt: second.toISOString(), rating: "hard" },
		]);

		// Assert

		expect(actual).toEqual(expected);
	});

	it("Should continue from the given schedule when replaying with a start", () => {
		// Arrange

		const graded = new Date("2024-06-01T12:00:00Z");
		const reviewedAt = new Date("2024-06-05T12:00:00Z");
		const start = scheduleAllRatings(
			NO_STEPS_PROFILE,
			{ ...NEW_CARD, due: graded.toISOString() },
			graded,
		).good;
		const expected = scheduleAllRatings(
			NO_STEPS_PROFILE,
			start,
			reviewedAt,
		).good;

		// Act

		const actual = replayReviews(
			NO_STEPS_PROFILE,
			NEW_CARD.cardId,
			[{ reviewedAt: reviewedAt.toISOString(), rating: "good" }],
			start,
		);

		// Assert

		expect(actual).toEqual(expected);
	});
});
