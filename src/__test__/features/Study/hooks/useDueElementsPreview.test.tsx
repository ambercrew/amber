import { waitFor } from "@testing-library/react";
import { useDueElementsPreview } from "../../../../features/Study/hooks/useDueElementsPreview";
import { getDueElements } from "../../../../api/study/api/studyApi";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { DueElementDto } from "../../../../api/study/dto/dueElementDto";

vi.mock(import("../../../../api/study/api/studyApi"));

function studyStateFor(status: "editing" | "studying") {
	return {
		status,
		queue: [],
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

describe("useDueElementsPreview", () => {
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
});
