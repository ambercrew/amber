import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudyProfileModal from "../../../../features/Study/components/StudyProfileModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import {
	cloneStudyProfile,
	getEffectiveStudyProfile,
	listStudyProfiles,
	updateStudyProfile,
} from "../../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { ElementsState } from "../../../../stores/elements/elementsReducer";

vi.mock(import("../../../../api/study/api/studyProfileApi.ts"));

function makeProfile(overrides: Partial<StudyProfileDto>): StudyProfileDto {
	return {
		id: "profile-1",
		createdAt: "2024-01-01T00:00:00Z",
		modifiedAt: "2024-01-01T00:00:00Z",
		name: "Default",
		isDefault: true,
		desiredRetention: 0.9,
		fsrsParams: Array.from({ length: 21 }, (_, index) => index * 0.1),
		learningSteps: [],
		relearningSteps: [],
		initialIntervalMultiplier: 1.2,
		initialIntervalDays: 1,
		minIntervalDays: 1,
		...overrides,
	};
}

function cardElement(id: string): AnyElementDto {
	return {
		type: "card",
		data: {
			meta: {
				elementId: { type: "card", id },
				name: `Card ${id}`,
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

function elementsStateFor(currentElement: AnyElementDto | null): ElementsState {
	return { tree: [], isLoading: false, error: null, currentElement };
}

const firstProfile = makeProfile({ id: "profile-1", name: "Default" });
const secondProfile = makeProfile({
	id: "profile-2",
	name: "Custom",
	isDefault: false,
});

describe("StudyProfileModal", () => {
	beforeEach(() => {
		vi.mocked(listStudyProfiles).mockResolvedValue([
			firstProfile,
			secondProfile,
		]);
	});

	it("Should not list profiles when the modal is closed", () => {
		// Arrange

		// Act

		renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: false,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
			},
		});

		// Assert

		expect(listStudyProfiles).not.toHaveBeenCalled();
	});

	it("Should list profiles and select the first one when opened", async () => {
		// Arrange

		// Act

		renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
			},
		});

		// Assert

		await waitFor(() => {
			expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
				firstProfile.name,
			);
		});
	});

	it("Should select the current element's effective profile when opened with an element open", async () => {
		// Arrange

		vi.mocked(getEffectiveStudyProfile).mockResolvedValue({
			profile: secondProfile,
			source: "direct",
			inheritedFrom: null,
		});

		// Act

		renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
				elements: elementsStateFor(cardElement("1")),
			},
		});

		// Assert

		await waitFor(() => {
			expect(getEffectiveStudyProfile).toHaveBeenCalledWith({
				type: "card",
				id: "1",
			});
		});
		await waitFor(() => {
			expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
				secondProfile.name,
			);
		});
	});

	it("Should select the default profile when opened without an element open", async () => {
		// Arrange

		vi.mocked(listStudyProfiles).mockResolvedValue([
			secondProfile,
			firstProfile,
		]);

		// Act

		renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
				elements: elementsStateFor(null),
			},
		});

		// Assert

		expect(getEffectiveStudyProfile).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
				firstProfile.name,
			);
		});
	});

	it("Should switch the form to another profile when it is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
			},
		});
		await screen.findByRole("textbox", { name: "Name" });

		// Act

		await user.click(screen.getByRole("combobox", { name: "Profile" }));
		await user.click(
			screen.getByText(secondProfile.name, { selector: "p" }),
		);

		// Assert

		await waitFor(() => {
			expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
				secondProfile.name,
			);
		});
	});

	it("Should reset the form to a new profile when 'Create new profile' is selected", async () => {
		// Arrange

		const user = userEvent.setup();
		renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
			},
		});
		await screen.findByRole("textbox", { name: "Name" });

		// Act

		await user.click(screen.getByRole("combobox", { name: "Profile" }));
		await user.click(
			screen.getByText(/Create new profile/, { selector: "p" }),
		);

		// Assert

		expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
			"New profile",
		);
		expect(screen.getByRole("button", { name: "Create" })).toBeVisible();
	});

	it("Should close the modal when saving the form succeeds", async () => {
		// Arrange

		vi.mocked(updateStudyProfile).mockResolvedValue(firstProfile);
		const user = userEvent.setup();
		const { store } = renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
			},
		});
		await screen.findByRole("textbox", { name: "Name" });

		// Act

		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() => {
			expect(updateStudyProfile).toHaveBeenCalledTimes(1);
		});
		expect(store.getState().app.studyProfileModalOpened).toBe(false);
	});

	it("Should keep the modal open and refresh the list when cloning a profile", async () => {
		// Arrange

		vi.mocked(cloneStudyProfile).mockResolvedValue(
			makeProfile({ id: "profile-3", name: "Default (copy)" }),
		);
		const user = userEvent.setup();
		const { store } = renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
			},
		});
		await screen.findByRole("textbox", { name: "Name" });

		// Act

		await user.click(screen.getByRole("button", { name: "Clone" }));

		// Assert

		await waitFor(() => {
			expect(cloneStudyProfile).toHaveBeenCalledWith(firstProfile.id);
		});
		expect(listStudyProfiles).toHaveBeenCalledTimes(2);
		expect(store.getState().app.studyProfileModalOpened).toBe(true);
	});

	it("Should close the modal when its close button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderWithProviders(<StudyProfileModal />, {
			preloadedState: {
				app: {
					startedInitialStateLoading: false,
					importModalOpened: false,
					studyProfileModalOpened: true,
					settingsModalOpened: false,
					priorityModalOpened: false,
					studySessionSettingsModalOpened: false,
					authModalOpened: false,
					authModalInitialTab: "sign-in",
					verifyEmailModalOpened: false,
					manageAccountModalOpened: false,
				},
			},
		});
		const dialog = await screen.findByRole("dialog");

		// Act

		await user.click(within(dialog).getByRole("button", { name: "Close" }));

		// Assert

		expect(store.getState().app.studyProfileModalOpened).toBe(false);
	});
});
