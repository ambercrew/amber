import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileForm from "../../../../../features/Study/components/ProfileForm/ProfileForm";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";
import {
	cloneStudyProfile,
	createStudyProfile,
	deleteStudyProfile,
	setDefaultStudyProfile,
	updateStudyProfile,
} from "../../../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../../../api/study/dto/studyProfileDto";

vi.mock(import("../../../../../api/study/api/studyProfileApi.ts"));

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
		priorityInheritancePolicy: {
			placement: { type: "aboveParent" },
			ceilingPercentile: null,
		},
		...overrides,
	};
}

/** Each group of fields lives behind its own tab, so reveal it before querying. */
async function openTab(name: string) {
	await userEvent.setup().click(screen.getByRole("radio", { name }));
}

const openCardsTab = () => openTab("Cards");
const openQueueTab = () => openTab("Queue");

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
		await openCardsTab();
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

	it("Should render an empty learning steps input when the profile has no custom steps", async () => {
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
		await openCardsTab();

		// Assert

		expect(screen.getByPlaceholderText("1m 10m")).toHaveValue("");
	});

	it("Should render the learning steps separated by spaces when the profile has custom steps", async () => {
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
		await openCardsTab();

		// Assert

		expect(
			screen.getByRole("textbox", { name: "Learning steps" }),
		).toHaveValue("5m 15m");
	});

	it("Should submit the steps as a list when they are typed separated by spaces", async () => {
		// Arrange

		const profile = makeProfile();
		vi.mocked(updateStudyProfile).mockResolvedValue(profile);
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openCardsTab();

		// Act

		await user.type(
			screen.getByRole("textbox", { name: "Learning steps" }),
			"1m 10m 1d",
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() => {
			expect(updateStudyProfile).toHaveBeenCalledWith(
				profile.id,
				expect.objectContaining({
					learningSteps: ["1m", "10m", "1d"],
				}),
			);
		});
	});

	it("Should not render a percentile input when the policy takes no percentile", async () => {
		// Arrange

		const profile = makeProfile({
			priorityInheritancePolicy: {
				placement: { type: "belowParent" },
				ceilingPercentile: null,
			},
		});

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openQueueTab();

		// Assert

		expect(
			screen.queryByRole("textbox", { name: "Percentile" }),
		).not.toBeInTheDocument();
	});

	it("Should render the policy's percentile when the profile has one", async () => {
		// Arrange

		const profile = makeProfile({
			priorityInheritancePolicy: {
				placement: { type: "fixedPercentile", percentile: 35 },
				ceilingPercentile: null,
			},
		});

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openQueueTab();

		// Assert

		expect(screen.getByRole("textbox", { name: "Percentile" })).toHaveValue(
			"35",
		);
	});

	it("Should submit the selected policy with its percentile when the policy is changed", async () => {
		// Arrange

		const profile = makeProfile();
		vi.mocked(updateStudyProfile).mockResolvedValue(profile);
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openQueueTab();

		// Act

		await user.click(
			screen.getByRole("combobox", {
				name: "Placement policy",
			}),
		);
		await user.click(
			await screen.findByRole("option", { name: "Offset from parent" }),
		);
		await user.type(
			screen.getByRole("textbox", { name: "Offset (percentile points)" }),
			"15",
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() => {
			expect(updateStudyProfile).toHaveBeenCalledWith(
				profile.id,
				expect.objectContaining({
					priorityInheritancePolicy: {
						placement: {
							type: "offsetFromParent",
							offsetPercentile: 15,
						},
						ceilingPercentile: null,
					},
				}),
			);
		});
	});

	it("Should not render the cap controls when the placement is a fixed percentile", async () => {
		// Arrange

		const profile = makeProfile({
			priorityInheritancePolicy: {
				placement: { type: "fixedPercentile", percentile: 35 },
				ceilingPercentile: null,
			},
		});

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openQueueTab();

		// Assert

		expect(
			screen.queryByRole("checkbox", { name: "Cap priority" }),
		).not.toBeInTheDocument();
	});

	it("Should render the ceiling when the profile is capped", async () => {
		// Arrange

		const profile = makeProfile({
			priorityInheritancePolicy: {
				placement: { type: "belowParent" },
				ceilingPercentile: 20,
			},
		});

		// Act

		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openQueueTab();

		// Assert

		expect(
			screen.getByRole("checkbox", { name: "Cap priority" }),
		).toBeChecked();
		expect(
			screen.getByRole("textbox", { name: "Ceiling (percentile)" }),
		).toHaveValue("20");
	});

	it("Should submit the ceiling alongside the placement when the cap is enabled", async () => {
		// Arrange

		const profile = makeProfile();
		vi.mocked(updateStudyProfile).mockResolvedValue(profile);
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openQueueTab();

		// Act

		await user.click(
			screen.getByRole("checkbox", { name: "Cap priority" }),
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() => {
			expect(updateStudyProfile).toHaveBeenCalledWith(
				profile.id,
				expect.objectContaining({
					priorityInheritancePolicy: {
						placement: { type: "aboveParent" },
						ceilingPercentile: 20,
					},
				}),
			);
		});
	});

	it("Should drop the ceiling when the cap is turned off", async () => {
		// Arrange

		const profile = makeProfile({
			priorityInheritancePolicy: {
				placement: { type: "belowParent" },
				ceilingPercentile: 20,
			},
		});
		vi.mocked(updateStudyProfile).mockResolvedValue(profile);
		const user = userEvent.setup();
		renderWithProviders(
			<ProfileForm
				profile={profile}
				onSaved={vi.fn()}
				onSubmitted={vi.fn()}
			/>,
		);
		await openQueueTab();

		// Act

		await user.click(
			screen.getByRole("checkbox", { name: "Cap priority" }),
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() => {
			expect(updateStudyProfile).toHaveBeenCalledWith(
				profile.id,
				expect.objectContaining({
					priorityInheritancePolicy: {
						placement: { type: "belowParent" },
						ceilingPercentile: null,
					},
				}),
			);
		});
	});
	it("Should show a validation error when a step is not a number followed by a unit", async () => {
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
		await openCardsTab();

		// Act

		await user.type(
			screen.getByRole("textbox", { name: "Learning steps" }),
			"1m bogus",
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		expect(
			await screen.findByText(
				"Each space-separated step must be a number followed by m, h or d (e.g. 1m 10m 1d)",
			),
		).toBeVisible();
		expect(updateStudyProfile).not.toHaveBeenCalled();
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
