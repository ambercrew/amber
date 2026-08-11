import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SetStudyProfileModal from "../../../../../../features/ElementsBrowser/components/BulkActions/modals/SetStudyProfileModal";
import { BulkCallApi } from "../../../../../../features/ElementsBrowser/components/BulkActions/bulkCallApi";
import { assignStudyProfileBulk } from "../../../../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../../../../api/study/dto/studyProfileDto";
import { ElementId } from "../../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../../api/study/api/studyProfileApi"));

const ELEMENT_IDS: ElementId[] = [{ type: "learningAsset", id: "asset-1" }];

const PROFILE: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
	name: "Default profile",
	isDefault: true,
	desiredRetention: 0.9,
	fsrsParams: [],
	initialIntervalMultiplier: 1,
	initialIntervalDays: 1,
	minIntervalDays: 1,
};

const callApi: BulkCallApi = cb => cb().then(() => undefined);

function render() {
	const onClose = vi.fn();
	const onSuccess = vi.fn();

	renderWithProviders(
		<SetStudyProfileModal
			opened
			elementIds={ELEMENT_IDS}
			profiles={[PROFILE]}
			callApi={callApi}
			onClose={onClose}
			onSuccess={onSuccess}
		/>,
	);

	return { onClose, onSuccess };
}

describe("SetStudyProfileModal", () => {
	beforeEach(() => {
		vi.mocked(assignStudyProfileBulk).mockResolvedValue(undefined);
	});

	it("Should render the title and default to inherit from parent when opened", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("heading", { name: "Set study profile" }),
		).toBeInTheDocument();
		expect(
			screen.getByDisplayValue("Inherit from parent"),
		).toBeInTheDocument();
	});

	it("Should call onClose when Cancel is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onClose } = render();

		// Act

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		// Assert

		expect(onClose).toHaveBeenCalled();
	});

	it("Should assign null when saved without changing the selection", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(assignStudyProfileBulk).toHaveBeenCalledWith(
				ELEMENT_IDS,
				null,
			),
		);
		expect(onSuccess).toHaveBeenCalled();
	});

	it("Should assign the selected profile's id when a profile is picked and saved", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onSuccess } = render();

		// Act

		await user.click(screen.getByDisplayValue("Inherit from parent"));
		await user.click(await screen.findByText("Default profile"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		// Assert

		await waitFor(() =>
			expect(assignStudyProfileBulk).toHaveBeenCalledWith(
				ELEMENT_IDS,
				PROFILE.id,
			),
		);
		expect(onSuccess).toHaveBeenCalled();
	});
});
