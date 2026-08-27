import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileForm from "../../../../features/Study/components/ProfileForm";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import {
	cloneStudyProfile,
	createStudyProfile,
	deleteStudyProfile,
	setDefaultStudyProfile,
	updateStudyProfile,
} from "../../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";

vi.mock(import("../../../../api/study/api/studyProfileApi.ts"));

const { openConfirmModal } = vi.hoisted(() => ({ openConfirmModal: vi.fn() }));
vi.mock(import("@mantine/modals"), async importOriginal => {
	const actual = await importOriginal();
	return { ...actual, modals: { ...actual.modals, openConfirmModal } };
});

function makeProfile(
	overrides: Partial<StudyProfileDto> = {},
): StudyProfileDto {
	return {
		id: "profile-1",
		createdAt: "2024-01-01T00:00:00Z",
		modifiedAt: "2024-01-01T00:00:00Z",
		name: "Custom",
		isDefault: false,
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

describe("ProfileForm", () => {
	beforeEach(() => {
		openConfirmModal.mockReset();
	});

	it("Should render the profile's values when editing an existing profile", () => {
		// Arrange

		const profile = makeProfile({ name: "Custom" });

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);

		// Assert

		expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
			"Custom",
		);
		expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
	});

	it("Should render default values for a new profile when profile is null", () => {
		// Arrange

		// Act

		renderWithProviders(
			<ProfileForm
				profile={null}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);

		// Assert

		expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
			"New profile",
		);
		expect(screen.getByRole("button", { name: "Create" })).toBeVisible();
	});

	it("Should not render Clone, Delete or Make default for a new profile", () => {
		// Arrange

		// Act

		renderWithProviders(
			<ProfileForm
				profile={null}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);

		// Assert

		expect(
			screen.queryByRole("button", { name: "Clone" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Delete" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Make default" }),
		).not.toBeInTheDocument();
	});

	it("Should not render Delete or Make default for the default profile", () => {
		// Arrange

		const profile = makeProfile({ isDefault: true });

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);

		// Assert

		expect(screen.getByRole("button", { name: "Clone" })).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Delete" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Make default" }),
		).not.toBeInTheDocument();
	});

	it("Should call updateStudyProfile and both callbacks when saving an existing profile", async () => {
		// Arrange

		const profile = makeProfile();
		vi.mocked(updateStudyProfile).mockResolvedValue(profile);
		const onSaved = vi.fn();
		const onSubmitted = vi.fn();
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={onSaved}
				onSubmitted={onSubmitted}
			/>,
		);

		// Act

		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() => {
			expect(updateStudyProfile).toHaveBeenCalledWith(
				profile.id,
				expect.objectContaining({ name: profile.name }),
			);
		});
		expect(onSaved).toHaveBeenCalledTimes(1);
		expect(onSubmitted).toHaveBeenCalledTimes(1);
	});

	it("Should call createStudyProfile when submitting a new profile", async () => {
		// Arrange

		vi.mocked(createStudyProfile).mockResolvedValue(makeProfile());
		const onSaved = vi.fn();
		const onSubmitted = vi.fn();
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={null}
				onSaved={onSaved}
				onSubmitted={onSubmitted}
			/>,
		);

		// Act

		await user.click(screen.getByRole("button", { name: "Create" }));

		// Assert

		await waitFor(() => {
			expect(createStudyProfile).toHaveBeenCalledTimes(1);
		});
		expect(onSaved).toHaveBeenCalledTimes(1);
		expect(onSubmitted).toHaveBeenCalledTimes(1);
	});

	it("Should show a validation error and not submit when FSRS weights don't have exactly 21 values", async () => {
		// Arrange

		const profile = makeProfile();
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		const weightsInput = screen.getByRole("textbox", {
			name: "FSRS weights",
		});

		// Act

		await user.clear(weightsInput);
		await user.type(weightsInput, "0.1, 0.2, 0.3");
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		expect(
			await screen.findByText("Enter exactly 21 comma-separated numbers"),
		).toBeVisible();
		expect(updateStudyProfile).not.toHaveBeenCalled();
	});

	it("Should show the learning steps placeholder when the profile has no custom steps", () => {
		// Arrange

		const profile = makeProfile({ learningSteps: [] });

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);

		// Assert

		expect(screen.getByPlaceholderText("1m, 10m")).toBeVisible();
	});

	it("Should hide the learning steps placeholder when the profile already has custom steps", () => {
		// Arrange

		const profile = makeProfile({ learningSteps: ["5m", "15m"] });

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);

		// Assert

		expect(
			screen.queryByPlaceholderText("1m, 10m"),
		).not.toBeInTheDocument();
	});

	it("Should call cloneStudyProfile and only onSaved when Clone is clicked", async () => {
		// Arrange

		const profile = makeProfile();
		vi.mocked(cloneStudyProfile).mockResolvedValue(profile);
		const onSaved = vi.fn();
		const onSubmitted = vi.fn();
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={onSaved}
				onSubmitted={onSubmitted}
			/>,
		);

		// Act

		await user.click(screen.getByRole("button", { name: "Clone" }));

		// Assert

		await waitFor(() => {
			expect(cloneStudyProfile).toHaveBeenCalledWith(profile.id);
		});
		expect(onSaved).toHaveBeenCalledTimes(1);
		expect(onSubmitted).not.toHaveBeenCalled();
	});

	it("Should call setDefaultStudyProfile and onSaved when Make default is clicked", async () => {
		// Arrange

		const profile = makeProfile();
		vi.mocked(setDefaultStudyProfile).mockResolvedValue(profile);
		const onSaved = vi.fn();
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={onSaved}
				onSubmitted={vi.fn()}
			/>,
		);

		// Act

		await user.click(screen.getByRole("button", { name: "Make default" }));

		// Assert

		await waitFor(() => {
			expect(setDefaultStudyProfile).toHaveBeenCalledWith(profile.id);
		});
		expect(onSaved).toHaveBeenCalledTimes(1);
	});

	it("Should ask for confirmation before deleting a profile", async () => {
		// Arrange

		const profile = makeProfile();
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);

		// Act

		await user.click(screen.getByRole("button", { name: "Delete" }));

		// Assert

		expect(openConfirmModal).toHaveBeenCalledTimes(1);
		expect(deleteStudyProfile).not.toHaveBeenCalled();
	});

	it("Should call deleteStudyProfile and onSaved when the deletion is confirmed", async () => {
		// Arrange

		const profile = makeProfile();
		vi.mocked(deleteStudyProfile).mockResolvedValue(undefined);
		const onSaved = vi.fn();
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={onSaved}
				onSubmitted={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));
		const { onConfirm } = openConfirmModal.mock.calls[0][0] as {
			onConfirm: () => void;
		};

		// Act

		onConfirm();

		// Assert

		await waitFor(() => {
			expect(deleteStudyProfile).toHaveBeenCalledWith(profile.id);
		});
		expect(onSaved).toHaveBeenCalledTimes(1);
	});
});
