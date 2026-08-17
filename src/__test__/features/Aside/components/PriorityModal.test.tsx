import { fireEvent, screen, waitFor } from "@testing-library/react";
import PriorityModal from "../../../../features/Aside/components/PriorityModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import {
	getElementDetails,
	setElementPriorityByPercentage,
	setElementPriorityByRank,
} from "../../../../api/elements/api/elementsApi";
import { ElementDetailsResponseDto } from "../../../../api/elements/dto/elementDetailsDto";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { ElementsState } from "../../../../stores/elements/elementsReducer";
import { AppState } from "../../../../stores/app/appReducer";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";

vi.mock(import("../../../../api/elements/api/elementsApi.ts"));

const cardElementId = { type: "card" as const, id: "card-1" };

const profile: StudyProfileDto = {
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
};

function cardElement(): AnyElementDto {
	return {
		type: "card",
		data: {
			meta: {
				elementId: cardElementId,
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
}

function makeDetails(
	overrides: Partial<ElementDetailsResponseDto> = {},
): ElementDetailsResponseDto {
	return {
		bibliographicalSource: null,
		derivedFromName: null,
		cardReview: null,
		learningAssetReview: null,
		effectiveProfile: { profile, source: "default", inheritedFrom: null },
		profiles: [],
		inheritedProfileName: null,
		priority: { rank: 3, total: 5, percentage: 50 },
		...overrides,
	};
}

function elementsStateFor(currentElement: AnyElementDto | null): ElementsState {
	return { tree: [], isLoading: false, error: null, currentElement };
}

function appStateFor(priorityModalOpened: boolean): AppState {
	return {
		startedInitialStateLoading: false,
		importModalOpened: false,
		studyProfileModalOpened: false,
		settingsModalOpened: false,
		priorityModalOpened,
		studySessionSettingsModalOpened: false,
		authModalOpened: false,
		authModalInitialTab: "sign-in",
		verifyEmailModalOpened: false,
	};
}

describe("PriorityModal", () => {
	beforeEach(() => {
		vi.mocked(getElementDetails).mockResolvedValue(makeDetails());
	});

	it("Should not load element details when the dialog is closed", () => {
		// Arrange

		// Act

		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(false),
				elements: elementsStateFor(cardElement()),
			},
		});

		// Assert

		expect(getElementDetails).not.toHaveBeenCalled();
	});

	it("Should show loading state while element details have not resolved yet", () => {
		// Arrange

		vi.mocked(getElementDetails).mockReturnValue(
			new Promise(() => undefined),
		);

		// Act

		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});

		// Assert

		expect(screen.getByText("Loading…")).toBeInTheDocument();
	});

	it("Should display the current rank and percentage when details have loaded", async () => {
		// Arrange

		// Act

		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});

		// Assert

		expect(await screen.findByDisplayValue("50%")).toBeInTheDocument();
		expect(screen.getByDisplayValue("3")).toBeInTheDocument();
		expect(screen.getByText("Rank 3 of 5")).toBeInTheDocument();
	});

	it("Should set priority by rank and reload details when the position input changes", async () => {
		// Arrange

		vi.mocked(setElementPriorityByRank).mockResolvedValue(undefined);
		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		const positionInput = await screen.findByLabelText("Position");

		// Act

		fireEvent.change(positionInput, { target: { value: "1" } });

		// Assert

		expect(setElementPriorityByRank).toHaveBeenCalledWith(cardElementId, 1);
		await waitFor(() => expect(getElementDetails).toHaveBeenCalledTimes(2));
	});

	it("Should set priority by percentage and reload details when the percentage input changes", async () => {
		// Arrange

		vi.mocked(setElementPriorityByPercentage).mockResolvedValue(undefined);
		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		const percentageInput = await screen.findByLabelText("Percentage");

		// Act

		fireEvent.change(percentageInput, { target: { value: "0%" } });

		// Assert

		expect(setElementPriorityByPercentage).toHaveBeenCalledWith(
			cardElementId,
			0,
		);
		await waitFor(() => expect(getElementDetails).toHaveBeenCalledTimes(2));
	});

	it("Should move the percentage by exactly one element when stepping with the arrow keys", async () => {
		// Arrange

		vi.mocked(setElementPriorityByPercentage).mockResolvedValue(undefined);
		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		const percentageInput = await screen.findByLabelText("Percentage");

		// Act

		fireEvent.keyDown(percentageInput, { key: "ArrowUp" });

		// Assert

		// Percentage step is 100/total = 100/5 = 20, so one arrow press moves
		// from the mocked 50% to 70%.
		expect(setElementPriorityByPercentage).toHaveBeenCalledWith(
			cardElementId,
			70,
		);
	});
});
