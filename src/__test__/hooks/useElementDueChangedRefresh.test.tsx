import { act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useElementDueChangedRefresh } from "../../hooks/useElementDueChangedRefresh";
import { getElementDetails } from "../../api/elements/api/elementsApi";
import { AnyElementDto } from "../../api/elements/dto/anyElementDto";
import { ELEMENT_DUE_CHANGED_EVENT } from "../../api/study/events/elementDueChangedEvent";
import { renderWithProviders } from "../test-utils/renderWithProviders";

vi.mock(import("../../api/elements/api/elementsApi"));

const EXTRACT_ELEMENT: AnyElementDto = {
	type: "extract",
	data: {
		meta: {
			elementId: { type: "extract", id: "extract-1" },
			name: "Extract 1",
			parent: null,
			position: "0",
			tags: [],
			createdAt: "2024-01-01T00:00:00Z",
			modifiedAt: "2024-01-01T00:00:00Z",
			nameSource: "manual",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
		content: "",
		intervalMultiplier: 1.2,
	},
};

function HookWrapper() {
	useElementDueChangedRefresh();
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

function renderHookWith(currentElement: AnyElementDto | null) {
	renderWithProviders(<HookWrapper />, {
		preloadedState: {
			elements: {
				tree: [],
				isLoading: false,
				error: null,
				currentElement,
				zoomOwnedByCurrentView: false,
			},
		},
	});
}

describe("useElementDueChangedRefresh", () => {
	beforeEach(() => {
		vi.mocked(listen).mockClear();
	});

	it("Should reload the open element's details when the backend reports a due change", async () => {
		// Arrange

		renderHookWith(EXTRACT_ELEMENT);

		// Act

		await act(async () => {
			emitTauriEvent(ELEMENT_DUE_CHANGED_EVENT);
		});

		// Assert

		expect(getElementDetails).toHaveBeenCalledWith(
			EXTRACT_ELEMENT.data.meta.elementId,
		);
	});

	it("Should do nothing when no element is open", async () => {
		// Arrange

		renderHookWith(null);

		// Act

		await act(async () => {
			emitTauriEvent(ELEMENT_DUE_CHANGED_EVENT);
		});

		// Assert

		expect(getElementDetails).not.toHaveBeenCalled();
	});
});
