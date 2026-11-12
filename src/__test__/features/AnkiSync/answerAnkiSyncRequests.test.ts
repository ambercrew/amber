import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import { replayCardReviews } from "../../../features/AnkiSync/answerAnkiSyncRequests";

const PROFILE: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2024-01-01T00:00:00Z",
	modifiedAt: "2024-01-01T00:00:00Z",
	name: "Default",
	isDefault: true,
	desiredRetention: 0.9,
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

describe("answerAnkiSyncRequests", () => {
	it("Should reschedule each card in order when given review histories", async () => {
		// Arrange

		const event = {
			requestId: "1",
			cards: ["card-1", "card-2"].map(cardId => ({
				cardId,
				profile: PROFILE,
				start: null,
				reviews: [
					{
						reviewedAt: "2024-06-01T12:00:00Z",
						rating: "good" as const,
					},
				],
			})),
		};

		// Act

		const actual = await replayCardReviews(event);

		// Assert

		expect(actual).toMatchObject({
			reviews: [
				{ cardId: "card-1", state: "learning", reps: 1 },
				{ cardId: "card-2", state: "learning", reps: 1 },
			],
		});
	});
});
