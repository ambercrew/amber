import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SyncButton from "../../../../features/Sidebar/components/SyncButton";
import SyncingModal from "../../../../features/Sidebar/components/SyncingModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { UserInformationDto } from "../../../../api/backend/dto/userInformationDto";

function renderSyncUi(isSyncing: boolean, isFinishingBeforeClose: boolean) {
	return renderWithProviders(
		<>
			<SyncButton />
			<SyncingModal />
		</>,
		{
			preloadedState: {
				user: {
					isSignedIn: true,
					isOffline: false,
					userInformation: {
						isEmailVerified: true,
					} as UserInformationDto,
				},
				sync: {
					isSyncing,
					isSyncHeld: false,
					isFinishingBeforeClose,
					elementRefreshCount: 0,
				},
			},
		},
	);
}

describe("Sync indicators", () => {
	it("Should spin the sync button without blocking the app when a background sync runs", () => {
		// Arrange & Act

		renderSyncUi(true, false);

		// Assert

		expect(screen.getByRole("button", { name: "Sync" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Sync" })).toHaveAttribute(
			"data-loading",
		);
		expect(
			screen.queryByText("Syncing, please wait..."),
		).not.toBeInTheDocument();
	});

	it("Should show the syncing dialog when closing waits on a sync", () => {
		// Arrange & Act

		renderSyncUi(true, true);

		// Assert

		expect(screen.getByText("Syncing, please wait...")).toBeInTheDocument();
	});

	it("Should hide the syncing dialog when the user closes without waiting", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderSyncUi(true, true);

		// Act

		await user.click(
			screen.getByRole("button", { name: "Close without waiting" }),
		);

		// Assert

		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
	});

	it("Should hide the syncing dialog when the user keeps working", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderSyncUi(true, true);

		// Act

		await user.click(screen.getByRole("button", { name: "Keep working" }));

		// Assert

		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
		expect(store.getState().sync.isSyncing).toBe(true);
	});

	it("Should keep working when the syncing dialog is dismissed with its close button", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderSyncUi(true, true);

		// Act

		await user.click(screen.getByRole("button", { name: "Close" }));

		// Assert

		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
	});

	it("Should leave the sync button enabled when no sync runs", () => {
		// Arrange & Act

		renderSyncUi(false, false);

		// Assert

		expect(screen.getByRole("button", { name: "Sync" })).toBeEnabled();
	});
});
