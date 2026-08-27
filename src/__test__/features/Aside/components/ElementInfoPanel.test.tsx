import { screen, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import ElementInfoPanel from "../../../../features/Aside/components/ElementInfoPanel";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { ElementDetailsResponseDto } from "../../../../api/elements/dto/elementDetailsDto";
import { ElementsState } from "../../../../stores/elements/elementsReducer";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import {
	finishLearningAsset,
	setElementDue,
} from "../../../../api/study/api/studyApi";
import { getElementDetails } from "../../../../api/elements/api/elementsApi";
import { listBibliographicalSources } from "../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import {
	fromDateInputValue,
	toDateInputValue,
} from "../../../../utils/dateInputValue";
import { ELEMENT_DUE_CHANGED_EVENT } from "../../../../api/study/events/elementDueChangedEvent";

vi.mock(import("../../../../api/study/api/studyApi"));
vi.mock(import("../../../../api/elements/api/elementsApi"));
vi.mock(
	import("../../../../api/bibliographicalSources/api/bibliographicalSourcesApi"),
);

const profile: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2024-01-01T00:00:00Z",
	modifiedAt: "2024-01-01T00:00:00Z",
	name: "Default",
	isDefault: true,
	desiredRetention: 0.9,
	fsrsParams: [],
	learningSteps: [],
	relearningSteps: [],
	initialIntervalMultiplier: 1.2,
	initialIntervalDays: 1,
	minIntervalDays: 1,
};

function learningAsset(): AnyElementDto {
	return {
		type: "learningAsset",
		data: {
			meta: {
				elementId: { type: "learningAsset", id: "asset-1" },
				name: "Asset 1",
				parent: null,
				position: "0",
				tags: [],
				createdAt: "2024-01-01T00:00:00Z",
				modifiedAt: "2024-01-01T00:00:00Z",
				bibliographicalSourceId: null,
				derivedFrom: null,
			},
			readPoint: { split: 0, block: 0 },
			intervalMultiplier: 1.2,
		},
	};
}

function folder(): AnyElementDto {
	return {
		type: "folder",
		data: {
			meta: {
				elementId: { type: "folder", id: "folder-1" },
				name: "Folder 1",
				parent: null,
				position: "0",
				tags: [],
				createdAt: "2024-01-01T00:00:00Z",
				modifiedAt: "2024-01-01T00:00:00Z",
				bibliographicalSourceId: null,
				derivedFrom: null,
			},
		},
	};
}

function makeDetails(
	overrides: Partial<ElementDetailsResponseDto> = {},
): ElementDetailsResponseDto {
	return {
		bibliographicalSource: null,
		derivedFromName: null,
		cardReview: null,
		learningAssetReview: {
			elementId: { type: "learningAsset", id: "asset-1" },
			due: "2026-01-01T00:00:00.000Z",
			intervalDays: 1,
			lastReviewed: null,
			finishedAt: null,
		},
		effectiveProfile: { profile, source: "default", inheritedFrom: null },
		profiles: [profile],
		inheritedProfileName: null,
		priority: { rank: 1, total: 1, percentage: 0 },
		...overrides,
	};
}

/** Runs the handler the panel registered with `listen` for `event`. */
function emitTauriEvent(event: string) {
	const calls = vi
		.mocked(listen)
		.mock.calls.filter(([name]) => name === event);
	const latest = calls[calls.length - 1];
	if (latest) latest[1]({ event, id: 0, payload: null });
}

function elementsStateFor(currentElement: AnyElementDto): ElementsState {
	return { tree: [], isLoading: false, error: null, currentElement };
}

function renderPanel(currentElement: AnyElementDto, details = makeDetails()) {
	return renderWithProviders(<ElementInfoPanel />, {
		preloadedState: {
			elements: elementsStateFor(currentElement),
			elementDetails: {
				elementId: currentElement.data.meta.elementId,
				details,
				isLoading: false,
			},
		},
	});
}

describe("ElementInfoPanel", () => {
	beforeEach(() => {
		vi.mocked(listen).mockClear();
		vi.mocked(listBibliographicalSources).mockResolvedValue([]);
		localStorage.setItem("element-info-panel.details.opened", "true");
		localStorage.setItem("element-info-panel.study.opened", "true");
	});

	it("Should show an editable due date and finished switch for a learning asset", async () => {
		// Arrange, Act

		renderPanel(learningAsset());
		await act(async () => {});

		// Assert

		expect(screen.getByLabelText("Due")).toBeInTheDocument();
		expect(screen.getByLabelText("Finished")).toBeInTheDocument();
	});

	it("Should show neither a due editor nor a finished switch for a folder", async () => {
		// Arrange, Act

		renderPanel(folder(), {
			...makeDetails(),
			cardReview: null,
			learningAssetReview: null,
		});
		await act(async () => {});

		// Assert

		expect(screen.queryByLabelText("Due")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Finished")).not.toBeInTheDocument();
	});

	it("Should persist a new due date when a date is picked", async () => {
		// Arrange

		vi.mocked(setElementDue).mockResolvedValue(undefined);
		const user = userEvent.setup();
		const element = learningAsset();
		renderPanel(element);
		await act(async () => {});

		// Act

		await user.click(screen.getByLabelText("Due"));
		await user.click(
			await screen.findByRole("button", { name: /15 january 2026/i }),
		);
		await user.click(
			screen.getByRole("button", { name: "Confirm due date" }),
		);

		// Assert

		const current = toDateInputValue("2026-01-01T00:00:00.000Z")!;
		const next = `2026-01-15${current.slice(10)}`;
		await waitFor(() => {
			expect(setElementDue).toHaveBeenCalledWith(
				element.data.meta.elementId,
				fromDateInputValue(next),
			);
		});
	});

	it("Should reload the element details when the backend reports a due change", async () => {
		// Arrange

		vi.mocked(getElementDetails).mockResolvedValue(makeDetails());
		const element = learningAsset();
		renderPanel(element);
		await act(async () => {});

		// Act

		await act(async () => {
			emitTauriEvent(ELEMENT_DUE_CHANGED_EVENT);
		});

		// Assert

		expect(getElementDetails).toHaveBeenCalledWith(
			element.data.meta.elementId,
		);
	});

	it("Should mark the learning asset finished when the finished switch is turned on", async () => {
		// Arrange

		const element = learningAsset();
		vi.mocked(finishLearningAsset).mockResolvedValue({
			elementId: element.data.meta.elementId,
			due: "2026-01-01T00:00:00.000Z",
			intervalDays: 1,
			lastReviewed: null,
			finishedAt: "2026-01-20T00:00:00.000Z",
		});
		vi.mocked(getElementDetails).mockResolvedValue(makeDetails());
		const user = userEvent.setup();
		renderPanel(element);
		await act(async () => {});

		// Act

		await user.click(screen.getByLabelText("Finished"));

		// Assert

		await waitFor(() => {
			expect(finishLearningAsset).toHaveBeenCalledWith(
				element.data.meta.elementId,
			);
		});
	});
});
