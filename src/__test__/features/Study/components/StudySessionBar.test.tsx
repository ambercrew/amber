import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudySessionBar from "../../../../features/Study/components/StudySessionBar";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import {
	getCardScheduling,
	previewNextLearningAsset,
} from "../../../../api/study/api/studyApi";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { formatRelativeDueDate } from "../../../../utils/formatRelativeDueDate";
import { scheduleAllRatings } from "../../../../features/Study/utils/cardScheduling";
import { CardSchedulingDto } from "../../../../api/study/dto/cardSchedulingDto";
import { Rating } from "../../../../types/study/rating";

vi.mock(import("../../../../api/study/api/studyApi.ts"));

const cardElementId = { type: "card" as const, id: "card-1" };
const learningAssetElementId = {
	type: "learningAsset" as const,
	id: "learningAsset-1",
};
const cardQueueItem = { elementId: cardElementId, title: "Card 1" };
const learningAssetQueueItem = {
	elementId: learningAssetElementId,
	title: "LearningAsset 1",
};

const META_FIELDS = {
	parent: null,
	position: "0",
	tags: [],
	createdAt: "2024-01-01T00:00:00Z",
	modifiedAt: "2024-01-01T00:00:00Z",
	bibliographicalSourceId: null,
	derivedFrom: null,
};

const cardCurrentElement: AnyElementDto = {
	type: "card",
	data: {
		meta: { elementId: cardElementId, name: "Card 1", ...META_FIELDS },
		front: "Front",
		back: "Back",
	},
};

const learningAssetCurrentElement: AnyElementDto = {
	type: "learningAsset",
	data: {
		meta: {
			elementId: learningAssetElementId,
			name: "LearningAsset 1",
			...META_FIELDS,
		},
		readPoint: { split: 0, block: 0 },
		intervalMultiplier: 1.2,
	},
};

const BASE_STUDY_STATE = {
	status: "studying" as const,
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, finished: 0 },
	summary: null,
};

function elementsStateFor(currentElement: AnyElementDto) {
	return { tree: [], isLoading: false, error: null, currentElement };
}

function inMs(offsetMs: number): string {
	return new Date(Date.now() + offsetMs).toISOString();
}

// A brand new card under the default profile: ts-fsrs schedules it through its
// learning steps. The exact intervals are covered by the cardScheduling tests.
const CARD_SCHEDULING: CardSchedulingDto = {
	review: {
		cardId: cardElementId.id,
		due: inMs(0),
		stability: 0,
		difficulty: 0,
		reps: 0,
		lapses: 0,
		state: "new",
		lastReviewed: null,
		scheduledDays: 0,
		learningSteps: 0,
	},
	profile: {
		id: "profile-1",
		createdAt: "2024-01-01T00:00:00Z",
		modifiedAt: "2024-01-01T00:00:00Z",
		name: "Default",
		isDefault: true,
		desiredRetention: 0.9,
		fsrsParams: [],
		initialIntervalMultiplier: 1.2,
		initialIntervalDays: 1,
		minIntervalDays: 1,
	},
};

describe("StudySessionBar", () => {
	it("Should show a due date preview in each rating button's tooltip once the preview loads", async () => {
		// Arrange

		const user = userEvent.setup();
		vi.mocked(getCardScheduling).mockResolvedValue(CARD_SCHEDULING);
		const scheduled = scheduleAllRatings(
			CARD_SCHEDULING.profile,
			CARD_SCHEDULING.review,
			new Date(),
		);

		// Act

		renderWithProviders(<StudySessionBar />, {
			preloadedState: {
				study: {
					...BASE_STUDY_STATE,
					queue: [cardQueueItem],
					cardPhase: "answer",
				},
				elements: elementsStateFor(cardCurrentElement),
			},
		});

		// Assert

		const buttonsByRating: [string, Rating][] = [
			["Again", "again"],
			["Hard", "hard"],
			["Good", "good"],
			["Easy", "easy"],
		];
		for (const [name, rating] of buttonsByRating) {
			await user.hover(screen.getByRole("button", { name }));
			expect(
				await screen.findByText(
					formatRelativeDueDate(scheduled[rating].due),
					{ exact: false },
				),
			).toBeInTheDocument();
			await user.unhover(screen.getByRole("button", { name }));
		}
	});

	it("Should not show a due date preview in the rating buttons' tooltips before the preview loads", async () => {
		// Arrange

		const user = userEvent.setup();
		vi.mocked(getCardScheduling).mockReturnValue(
			new Promise(() => {
				// Never resolves; asserting the pre-load state.
			}),
		);

		// Act

		renderWithProviders(<StudySessionBar />, {
			preloadedState: {
				study: {
					...BASE_STUDY_STATE,
					queue: [cardQueueItem],
					cardPhase: "answer",
				},
				elements: elementsStateFor(cardCurrentElement),
			},
		});

		// Assert

		const againButton = screen.getByRole("button", { name: "Again" });
		expect(againButton).toBeVisible();
		await user.hover(againButton);
		expect(await screen.findByRole("tooltip")).toHaveTextContent("(1)");
		expect(screen.queryByText(/In \d/)).not.toBeInTheDocument();
	});

	it("Should show a due date preview in the Next button's tooltip once the preview loads", async () => {
		// Arrange

		const user = userEvent.setup();
		const due = inMs(2 * 24 * 3_600_000);
		vi.mocked(previewNextLearningAsset).mockResolvedValue(due);

		// Act

		renderWithProviders(<StudySessionBar />, {
			preloadedState: {
				study: {
					...BASE_STUDY_STATE,
					queue: [learningAssetQueueItem],
					cardPhase: "question",
				},
				elements: elementsStateFor(learningAssetCurrentElement),
			},
		});
		await user.hover(screen.getByRole("button", { name: "Next" }));

		// Assert

		expect(
			await screen.findByText(formatRelativeDueDate(due), {
				exact: false,
			}),
		).toBeInTheDocument();
	});

	it("Should not show a due date preview in the Finish button's tooltip", async () => {
		// Arrange

		const user = userEvent.setup();
		const due = inMs(2 * 24 * 3_600_000);
		vi.mocked(previewNextLearningAsset).mockResolvedValue(due);

		// Act

		renderWithProviders(<StudySessionBar />, {
			preloadedState: {
				study: {
					...BASE_STUDY_STATE,
					queue: [learningAssetQueueItem],
					cardPhase: "question",
				},
				elements: elementsStateFor(learningAssetCurrentElement),
			},
		});
		await user.hover(screen.getByRole("button", { name: "Finish" }));

		// Assert

		const tooltip = await screen.findByRole("tooltip");
		expect(tooltip).not.toHaveTextContent(formatRelativeDueDate(due));
		expect(tooltip).toHaveTextContent("Won't repeat (3)");
	});
});
