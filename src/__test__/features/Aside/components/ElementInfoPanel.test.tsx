import { screen, waitFor } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import ElementInfoPanel from "../../../../features/Aside/components/ElementInfoPanel";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { ElementDetailsResponseDto } from "../../../../api/elements/dto/elementDetailsDto";
import { ElementsState } from "../../../../stores/elements/elementsReducer";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import {
	setElementDue,
	setElementsStatus,
} from "../../../../api/study/api/studyApi";
import { listBibliographicalSources } from "../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import {
	fromDateInputValue,
	toDateInputValue,
} from "../../../../utils/dateInputValue";

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
	priorityInheritancePolicy: {
		placement: { type: "aboveParent" },
		ceilingPercentile: null,
	},
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
				nameSource: "manual",
				bibliographicalSourceId: null,
				derivedFrom: null,
			},
			type: "extracted",
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
				nameSource: "manual",
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
		status: "active",
		priority: { position: 1, total: 1, percentile: 0 },
		...overrides,
	};
}

function elementsStateFor(currentElement: AnyElementDto): ElementsState {
	return {
		tree: [],
		isLoading: false,
		error: null,
		currentElement,
		zoomOwnedByCurrentView: false,
	};
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
		vi.mocked(listBibliographicalSources).mockResolvedValue([]);
		localStorage.setItem("element-info-panel.details.opened", "true");
		localStorage.setItem("element-info-panel.study.opened", "true");
	});

	it("Should show an editable due date and every status when the element is a learning asset", async () => {
		// Arrange, Act

		renderPanel(learningAsset());
		await act(async () => {});

		// Assert

		expect(screen.getByLabelText("Due")).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Active" })).toBeChecked();
		expect(
			screen.getByRole("radio", { name: "Finished" }),
		).toBeInTheDocument();
	});

	it("Should show neither a due editor nor a status when the element is a folder", async () => {
		// Arrange, Act

		renderPanel(folder(), {
			...makeDetails(),
			cardReview: null,
			learningAssetReview: null,
			status: null,
		});
		await act(async () => {});

		// Assert

		expect(screen.queryByLabelText("Due")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("radio", { name: "Active" }),
		).not.toBeInTheDocument();
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

	it("Should set the learning asset's status when a status is picked", async () => {
		// Arrange

		const element = learningAsset();
		vi.mocked(setElementsStatus).mockResolvedValue(1);
		const user = userEvent.setup();
		renderPanel(element);
		await act(async () => {});

		// Act

		await user.click(screen.getByRole("radio", { name: "Finished" }));

		// Assert

		await waitFor(() => {
			expect(setElementsStatus).toHaveBeenCalledWith(
				[element.data.meta.elementId],
				"finished",
			);
		});
		expect(screen.getByRole("radio", { name: "Finished" })).toBeChecked();
	});
});
