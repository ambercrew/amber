import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudySessionSettingsModal from "../../../../features/Study/components/StudySessionSettingsModal";
import {
	getFuzzFactor,
	setFuzzFactor,
} from "../../../../api/study/api/studyApi";
import { listSavedSearches } from "../../../../api/savedSearches/api/savedSearchesApi";
import { openStudySessionSettingsModal } from "../../../../stores/app/appReducer";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/study/api/studyApi"));
vi.mock(import("../../../../api/savedSearches/api/savedSearchesApi"));

const RUST_ID = "a5d1f0c4-6a8e-4c1e-9d55-0b7c1f5a2e10";

async function renderOpened() {
	const user = userEvent.setup();
	const result = renderWithProviders(<StudySessionSettingsModal />);
	result.store.dispatch(openStudySessionSettingsModal());
	await user.click(
		await screen.findByLabelText("Study scope", { selector: "input" }),
	);
	await user.click(await screen.findByRole("option", { name: "Rust cards" }));
	return { user, store: result.store };
}

describe("StudySessionSettingsModal", () => {
	beforeEach(() => {
		vi.mocked(getFuzzFactor).mockResolvedValue(10);
		vi.mocked(setFuzzFactor).mockResolvedValue(undefined);
		vi.mocked(listSavedSearches).mockResolvedValue([
			{
				id: RUST_ID,
				createdAt: "2026-01-01T00:00:00Z",
				modifiedAt: "2026-01-01T00:00:00Z",
				name: "Rust cards",
				sort: null,
			},
		]);
	});

	it("Should commit the chosen scope when apply is clicked", async () => {
		// Arrange

		const { user, store } = await renderOpened();

		// Act

		await user.click(screen.getByRole("button", { name: "Apply" }));

		// Assert

		await waitFor(() =>
			expect(store.getState().study.studyScope).toEqual({
				type: "savedSearch",
				savedSearchId: RUST_ID,
			}),
		);
	});

	it("Should keep the previous scope when cancel is clicked", async () => {
		// Arrange

		const { user, store } = await renderOpened();

		// Act

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		// Assert

		expect(store.getState().study.studyScope).toBeNull();
	});
});
