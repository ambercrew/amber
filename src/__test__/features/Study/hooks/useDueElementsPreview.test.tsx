import { act, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useDueElementsPreview } from "../../../../features/Study/hooks/useDueElementsPreview";
import { getDueElements } from "../../../../api/study/api/studyApi";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { DueElementDto } from "../../../../api/study/dto/dueElementDto";
import { ELEMENT_DUE_CHANGED_EVENT } from "../../../../api/study/events/elementDueChangedEvent";

vi.mock(import("../../../../api/study/api/studyApi"));

function studyStateFor(status: "editing" | "studying") {
	return {
		status,
		queue: [],
		totalCount: 0,
		cardPhase: "question" as const,
		shownAt: null,
		counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
		summary: null,
	};
}

function HookWrapper() {
	useDueElementsPreview();
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

describe("useDueElementsPreview", () => {
	beforeEach(() => {
		vi.mocked(listen).mockClear();
	});

	it("Should load due elements into the queue when not studying", async () => {
		// Arrange

		const due: DueElementDto[] = [
			{ elementId: { type: "card", id: "card-1" }, title: "Card 1" },
		];
		vi.mocked(getDueElements).mockResolvedValue(due);

		// Act

		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: { study: studyStateFor("editing") },
		});

		// Assert

		await waitFor(() => {
			expect(store.getState().study.queue).toEqual(due);
		});
	});

	it("Should not fetch due elements when a session is already studying", () => {
		// Arrange

		// Act

		renderWithProviders(<HookWrapper />, {
			preloadedState: { study: studyStateFor("studying") },
		});

		// Assert

		expect(getDueElements).not.toHaveBeenCalled();
	});

	it("Should reload due elements when the backend reports a due change and a session is not studying", async () => {
		// Arrange

		vi.mocked(getDueElements).mockResolvedValue([]);
		renderWithProviders(<HookWrapper />, {
			preloadedState: { study: studyStateFor("editing") },
		});
		await waitFor(() => {
			expect(getDueElements).toHaveBeenCalledTimes(1);
		});

		// Act

		await act(async () => {
			emitTauriEvent(ELEMENT_DUE_CHANGED_EVENT);
		});

		// Assert

		await waitFor(() => {
			expect(getDueElements).toHaveBeenCalledTimes(2);
		});
	});
});
