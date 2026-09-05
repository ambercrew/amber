import { act, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useSessionScheduleChanges } from "../../../../features/Study/hooks/useSessionScheduleChanges";
import { getCardReview } from "../../../../api/study/api/studyApi";
import { CardReviewDto } from "../../../../api/study/dto/cardReviewDto";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { ELEMENT_DUE_CHANGED_EVENT } from "../../../../api/study/events/elementDueChangedEvent";
import { StudyState } from "../../../../stores/study/studyReducer";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/study/api/studyApi"));

const CARD_ELEMENT: AnyElementDto = {
	type: "card",
	data: {
		meta: {
			elementId: { type: "card", id: "1" },
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

const STUDYING_STATE: StudyState = {
	status: "studying",
	queue: [
		{ elementId: { type: "card", id: "1" }, title: "Card 1" },
		{ elementId: { type: "card", id: "2" }, title: "Card 2" },
	],
	totalCount: 2,
	cardPhase: "question",
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
};

function cardReview(due: string): CardReviewDto {
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

function HookWrapper() {
	useSessionScheduleChanges();
	return null;
}

/** Runs the handler the hook registered with `listen` for `event`. */
function emitTauriEvent(event: string) {
	const calls = vi
		.mocked(listen)
		.mock.calls.filter(([name]) => name === event);
	const latest = calls[calls.length - 1];
	if (latest) latest[1]({ event, id: 0, payload: null });
}

describe("useSessionScheduleChanges", () => {
	beforeEach(() => {
		vi.mocked(listen).mockClear();
	});

	it("Should drop the current element from the session queue when the backend reports it is no longer due", async () => {
		// Arrange

		vi.mocked(getCardReview).mockResolvedValue(
			cardReview(new Date(Date.now() + 2 * 86_400_000).toISOString()),
		);
		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: STUDYING_STATE,
				elements: {
					tree: [],
					isLoading: false,
					error: null,
					currentElement: CARD_ELEMENT,
				},
			},
		});

		// Act

		act(() => {
			emitTauriEvent(ELEMENT_DUE_CHANGED_EVENT);
		});

		// Assert

		await waitFor(() => {
			expect(
				store.getState().study.queue.map(item => item.elementId.id),
			).toEqual(["2"]);
		});
	});

	it("Should leave the session queue untouched when the current element is still due", async () => {
		// Arrange

		vi.mocked(getCardReview).mockResolvedValue(
			cardReview(new Date(Date.now() - 60_000).toISOString()),
		);
		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: STUDYING_STATE,
				elements: {
					tree: [],
					isLoading: false,
					error: null,
					currentElement: CARD_ELEMENT,
				},
			},
		});

		// Act

		act(() => {
			emitTauriEvent(ELEMENT_DUE_CHANGED_EVENT);
		});

		// Assert

		await waitFor(() => {
			expect(getCardReview).toHaveBeenCalled();
		});
		expect(
			store.getState().study.queue.map(item => item.elementId.id),
		).toEqual(["1", "2"]);
	});
});
