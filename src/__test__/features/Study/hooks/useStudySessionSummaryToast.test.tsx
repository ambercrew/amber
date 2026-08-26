import { notifications } from "@mantine/notifications";
import { useStudySessionSummaryToast } from "../../../../features/Study/hooks/useStudySessionSummaryToast";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("@mantine/notifications"));

const BASE_STUDY_STATE = {
	status: "editing" as const,
	queue: [],
	cardPhase: "question" as const,
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
};

function studyStateFor(
	summary: {
		cards: number;
		learningAssets: number;
		extracts?: number;
	} | null,
) {
	return {
		...BASE_STUDY_STATE,
		counts: { ...BASE_STUDY_STATE.counts, ...summary },
		summary: summary && { extracts: 0, ...summary, finished: 0 },
	};
}

function HookWrapper() {
	useStudySessionSummaryToast();
	return null;
}

describe("useStudySessionSummaryToast", () => {
	it("Should not show a toast when there is no summary", () => {
		// Arrange

		// Act

		renderWithProviders(<HookWrapper />, {
			preloadedState: { study: studyStateFor(null) },
		});

		// Assert

		expect(notifications.show).not.toHaveBeenCalled();
	});

	it("Should show a toast with the session counts when a summary is present", () => {
		// Arrange

		// Act

		renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: studyStateFor({
					cards: 3,
					learningAssets: 2,
					extracts: 4,
				}),
			},
		});

		// Assert

		expect(notifications.show).toHaveBeenCalledWith(
			expect.objectContaining({
				message:
					"Done for today — 3 cards, 2 learningAssets, 4 extracts",
			}),
		);
	});

	it("Should dismiss the summary after showing the toast", () => {
		// Arrange

		// Act

		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: studyStateFor({ cards: 1, learningAssets: 0 }),
			},
		});

		// Assert

		expect(store.getState().study.summary).toBeNull();
	});
});
