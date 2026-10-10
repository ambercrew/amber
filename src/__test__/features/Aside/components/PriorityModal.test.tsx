import { fireEvent, screen, waitFor } from "@testing-library/react";
import PriorityModal from "../../../../features/Aside/components/PriorityModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import {
	getElementDetails,
	getPriorityNeighbors,
	setElementPriorityByPosition,
	setElementPriorityByPercentile,
} from "../../../../api/elements/api/elementsApi";
import { ElementDetailsResponseDto } from "../../../../api/elements/dto/elementDetailsDto";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { ElementsState } from "../../../../stores/elements/elementsReducer";
import { AppState } from "../../../../stores/app/appReducer";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";

vi.mock(import("../../../../api/elements/api/elementsApi.ts"));

const cardElementId = { type: "card" as const, id: "card-1" };

function neighbor(name: string) {
	return { elementId: { type: "extract" as const, id: name }, name };
}

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
		priority: { position: 3, total: 5, percentile: 50 },
		...overrides,
	};
}

function elementsStateFor(currentElement: AnyElementDto | null): ElementsState {
	return {
		tree: [],
		isLoading: false,
		error: null,
		currentElement,
		zoomOwnedByCurrentView: false,
	};
}

function appStateFor(priorityModalOpened: boolean): AppState {
	return {
		startedInitialStateLoading: false,
		importModalOpened: false,
		studyProfileModalOpened: false,
		settingsModalOpened: false,
		priorityModalOpened,
		dueDateModalOpened: false,
		shortcutsModalOpened: false,
		studySessionSettingsModalOpened: false,
		authModalOpened: false,
		authModalInitialTab: "sign-in",
		verifyEmailModalOpened: false,
		manageAccountModalOpened: false,
		virtualKeyboardSuppressed: false,
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

	it("Should display the current position and percentile when details have loaded", async () => {
		// Arrange

		// Act

		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});

		// Assert

		expect(await screen.findByDisplayValue("50.00%")).toBeInTheDocument();
		expect(screen.getByDisplayValue("3")).toBeInTheDocument();
		expect(screen.getByText("Position 3 of 5")).toBeInTheDocument();
	});

	it("Should focus the position input when the dialog opens", async () => {
		// Arrange

		// Act

		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		const positionInput = await screen.findByLabelText("Position");

		// Assert

		await waitFor(() => expect(positionInput).toHaveFocus());
	});

	it("Should set priority by position and reload details when the position input changes", async () => {
		// Arrange

		vi.mocked(setElementPriorityByPosition).mockResolvedValue(undefined);
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

		expect(setElementPriorityByPosition).toHaveBeenCalledWith(
			cardElementId,
			1,
		);
		await waitFor(() => expect(getElementDetails).toHaveBeenCalledTimes(2));
	});

	it("Should set priority by percentile and reload details when the percentile input changes", async () => {
		// Arrange

		vi.mocked(setElementPriorityByPercentile).mockResolvedValue(undefined);
		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		const percentileInput = await screen.findByLabelText("Percentile");

		// Act

		fireEvent.change(percentileInput, { target: { value: "0%" } });

		// Assert

		expect(setElementPriorityByPercentile).toHaveBeenCalledWith(
			cardElementId,
			0,
		);
		await waitFor(() => expect(getElementDetails).toHaveBeenCalledTimes(2));
	});

	it("Should move the percentile by exactly one element when stepping with the arrow keys", async () => {
		// Arrange

		vi.mocked(setElementPriorityByPercentile).mockResolvedValue(undefined);
		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		const percentileInput = await screen.findByLabelText("Percentile");

		// Act

		fireEvent.keyDown(percentileInput, { key: "ArrowUp" });

		// Assert

		// Percentile step is 100/(total-1) = 100/4 = 25, so one arrow press moves
		// from the mocked 50% to 75%.
		expect(setElementPriorityByPercentile).toHaveBeenCalledWith(
			cardElementId,
			75,
		);
	});

	it("Should show the current element between the elements before and after when the position has neighbors", async () => {
		// Arrange

		vi.mocked(getPriorityNeighbors).mockResolvedValue({
			before: neighbor("Earlier extract"),
			after: neighbor("Later extract"),
		});

		// Act

		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});

		// Assert

		expect(await screen.findByText("Earlier extract")).toBeInTheDocument();
		expect(screen.getByText("Later extract")).toBeInTheDocument();
		expect(screen.getByText("Card 1")).toBeInTheDocument();
		expect(screen.getByText("Current")).toBeInTheDocument();
		expect(getPriorityNeighbors).toHaveBeenCalledWith(cardElementId, 3);
	});

	it("Should show only the element after when the position is the front of the queue", async () => {
		// Arrange

		vi.mocked(getPriorityNeighbors).mockResolvedValue({
			before: null,
			after: neighbor("Later extract"),
		});

		// Act

		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});

		// Assert

		expect(await screen.findByText("Later extract")).toBeInTheDocument();
		// An earlier test's result may show first, until this one's arrives.
		await waitFor(() =>
			expect(screen.queryByText("Before")).not.toBeInTheDocument(),
		);
		expect(screen.getByText("After")).toBeInTheDocument();
	});

	it("Should load the neighbors of the new position when the position changes", async () => {
		// Arrange

		vi.mocked(setElementPriorityByPosition).mockReturnValue(
			new Promise(() => undefined),
		);
		vi.mocked(getPriorityNeighbors).mockResolvedValue({
			before: null,
			after: null,
		});
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

		await waitFor(() =>
			expect(getPriorityNeighbors).toHaveBeenCalledWith(cardElementId, 1),
		);
	});

	it("Should keep showing the neighbors when the dialog reloads after a priority change", async () => {
		// Arrange

		vi.mocked(getPriorityNeighbors).mockResolvedValueOnce({
			before: neighbor("Earlier extract"),
			after: neighbor("Later extract"),
		});
		vi.mocked(setElementPriorityByPosition).mockResolvedValue(undefined);
		vi.mocked(getElementDetails)
			.mockResolvedValueOnce(makeDetails())
			.mockResolvedValueOnce(
				makeDetails({
					priority: { position: 1, total: 5, percentile: 0 },
				}),
			);
		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		expect(await screen.findByText("Earlier extract")).toBeInTheDocument();
		// The reloaded dialog's own request never answers, so only the kept
		// result can be on screen.
		vi.mocked(getPriorityNeighbors).mockReturnValue(
			new Promise(() => undefined),
		);

		// Act

		fireEvent.change(screen.getByLabelText("Position"), {
			target: { value: "1" },
		});

		// Assert

		await waitFor(() => expect(getElementDetails).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(screen.getByText("Position 1 of 5")).toBeInTheDocument(),
		);
		expect(screen.getByText("Earlier extract")).toBeInTheDocument();
		expect(screen.getByText("Later extract")).toBeInTheDocument();
	});

	it("Should replace the neighbors error with the neighbors when a later request succeeds", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(getPriorityNeighbors)
			.mockRejectedValueOnce(new Error("Neighbors failed"))
			.mockResolvedValue({
				before: neighbor("Earlier extract"),
				after: null,
			});
		vi.mocked(setElementPriorityByPosition).mockReturnValue(
			new Promise(() => undefined),
		);
		renderWithProviders(<PriorityModal />, {
			preloadedState: {
				app: appStateFor(true),
				elements: elementsStateFor(cardElement()),
			},
		});
		expect(await screen.findByText("Neighbors failed")).toBeInTheDocument();

		// Act

		fireEvent.change(screen.getByLabelText("Position"), {
			target: { value: "2" },
		});

		// Assert

		expect(await screen.findByText("Earlier extract")).toBeInTheDocument();
		expect(screen.queryByText("Neighbors failed")).not.toBeInTheDocument();
	});
});
