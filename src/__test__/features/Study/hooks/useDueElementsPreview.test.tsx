import { act, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useDueElementsPreview } from "../../../../features/Study/hooks/useDueElementsPreview";
import { getDueElements } from "../../../../api/study/api/studyApi";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { DueElementDto } from "../../../../api/study/dto/dueElementDto";
import { ELEMENT_DUE_CHANGED_EVENT } from "../../../../api/study/events/elementDueChangedEvent";
import { studyScopeChanged } from "../../../../stores/study/studyReducer";
import { STUDY_SESSION_SETTINGS_CHANGED } from "../../../../types/events/studySessionSettingsChangedEvent";

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
		studyScope: null,
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

	it("Should reload due elements within the new scope when the study scope changes", async () => {
		// Arrange

		vi.mocked(getDueElements).mockResolvedValue([]);
		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: { study: studyStateFor("editing") },
		});
		await waitFor(() => {
			expect(getDueElements).toHaveBeenCalledWith(null);
		});

		// Act

		act(() => {
			store.dispatch(
				studyScopeChanged({
					type: "savedSearch",
					savedSearchId: "saved-search-1",
				}),
			);
		});

		// Assert

		await waitFor(() => {
			expect(getDueElements).toHaveBeenLastCalledWith({
				type: "savedSearch",
				savedSearchId: "saved-search-1",
			});
		});
	});

	it("Should keep the new scope's queue when an older fetch resolves after it", async () => {
		// Arrange

		vi.mocked(getDueElements).mockResolvedValue([]);
		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: { study: studyStateFor("editing") },
		});
		await waitFor(() => {
			expect(getDueElements).toHaveBeenCalledWith(null);
		});
		const scoped: DueElementDto[] = [
			{ elementId: { type: "card", id: "card-1" }, title: "Card 1" },
		];
		const unscoped: DueElementDto[] = [
			...scoped,
			{ elementId: { type: "card", id: "card-2" }, title: "Card 2" },
		];
		let resolveOld!: (queue: DueElementDto[]) => void;
		vi.mocked(getDueElements)
			.mockImplementationOnce(
				() => new Promise(resolve => (resolveOld = resolve)),
			)
			.mockResolvedValueOnce(scoped);

		// Act

		// Mirrors Apply: the settings event fires before the new scope renders.
		act(() => {
			window.dispatchEvent(new Event(STUDY_SESSION_SETTINGS_CHANGED));
			store.dispatch(
				studyScopeChanged({
					type: "savedSearch",
					savedSearchId: "saved-search-1",
				}),
			);
		});
		await waitFor(() => {
			expect(store.getState().study.queue).toEqual(scoped);
		});
		await act(async () => resolveOld(unscoped));

		// Assert

		expect(store.getState().study.queue).toEqual(scoped);
	});
});
