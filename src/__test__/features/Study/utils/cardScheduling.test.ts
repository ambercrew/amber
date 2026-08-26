import { CardReviewDto } from "../../../../api/study/dto/cardReviewDto";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import { scheduleAllRatings } from "../../../../features/Study/utils/cardScheduling";

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
	initialIntervalMultiplier: 1.2,
	initialIntervalDays: 1,
	minIntervalDays: 1,
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

	it("Should schedule a whole number of days when a review card is rated Good", () => {
		// Arrange

		const review = REVIEW_CARD;

		// Act

		const actual = scheduleAllRatings(PROFILE, review, NOW).good;

		// Assert

		expect(actual.state).toBe("review");
		expect(actual.scheduledDays).toBeGreaterThan(1);
		expect(minutesUntilDue(actual.due)).toBe(actual.scheduledDays * 1440);
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
});
