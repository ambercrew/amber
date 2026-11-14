import { notifications } from "@mantine/notifications";
import {
	formatSessionDuration,
	useStudySessionSummaryToast,
} from "../../../../features/Study/hooks/useStudySessionSummaryToast";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("@mantine/notifications"));

const BASE_STUDY_STATE = {
	status: "editing" as const,
	queue: [],
	totalCount: 0,
	cardPhase: "question" as const,
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	studyScope: null,
	away: false,
	timedElementId: null,
	timeSpent: {},
	startedAt: null,
};

function studyStateFor(
	summary: {
		cards: number;
		learningAssets: number;
		extracts?: number;
		endedEarly?: boolean;
		durationMs?: number;
	} | null,
) {
	return {
		...BASE_STUDY_STATE,
		counts: BASE_STUDY_STATE.counts,
		summary: summary && {
			extracts: 0,
			endedEarly: false,
			durationMs: 18 * 60_000,
			...summary,
			finished: 0,
		},
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
					"Done for today — 3 cards, 2 learning assets, 4 extracts in 18 min",
			}),
		);
	});

	it("Should name only the kinds reviewed, in the singular for one, when the session was ended early", () => {
		// Arrange

		// Act

		renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: studyStateFor({
					cards: 1,
					learningAssets: 0,
					extracts: 2,
					endedEarly: true,
					durationMs: 20_000,
				}),
			},
		});

		// Assert

		expect(notifications.show).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Session ended — 1 card, 2 extracts in under a minute",
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

describe("formatSessionDuration", () => {
	it.each([
		[20_000, "under a minute"],
		[18 * 60_000, "18 min"],
		[60 * 60_000, "1 h"],
		[65 * 60_000, "1 h 5 min"],
	])("Should format %i ms as %s when given that duration", (ms, expected) => {
		// Act

		const actual = formatSessionDuration(ms);

		// Assert

		expect(actual).toBe(expected);
	});
});
