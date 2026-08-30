import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerifyEmailModal from "../../../../features/Auth/components/VerifyEmailModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { UserInformationDto } from "../../../../api/backend/dto/userInformationDto";

function makeUserInformation(
	overrides: Partial<UserInformationDto>,
): UserInformationDto {
	return {
		id: "user-1",
		username: "amber",
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		isEmailVerified: true,
		...overrides,
	};
}

describe("VerifyEmailModal", () => {
	it("Should open the modal automatically when the signed-in user's email is not verified", () => {
		// Arrange

		// Act

		const { store } = renderWithProviders(<VerifyEmailModal />, {
			preloadedState: {
				user: {
					isSignedIn: true,
					isOffline: false,
					userInformation: makeUserInformation({
						isEmailVerified: false,
					}),
				},
			},
		});

		// Assert

		expect(store.getState().app.verifyEmailModalOpened).toBe(true);
		expect(screen.getByText("Verify your email")).toBeInTheDocument();
	});

	it("Should not open the modal when the signed-in user's email is already verified", () => {
		// Arrange

		// Act

		const { store } = renderWithProviders(<VerifyEmailModal />, {
			preloadedState: {
				user: {
					isSignedIn: true,
					isOffline: false,
					userInformation: makeUserInformation({
						isEmailVerified: true,
					}),
				},
			},
		});

		// Assert

		expect(store.getState().app.verifyEmailModalOpened).toBe(false);
		expect(screen.queryByText("Verify your email")).not.toBeInTheDocument();
	});

	it("Should not open the modal when the user is not signed in", () => {
		// Arrange

		// Act

		const { store } = renderWithProviders(<VerifyEmailModal />, {
			preloadedState: {
				user: {
					isSignedIn: false,
					isOffline: false,
					userInformation: null,
				},
			},
		});

		// Assert

		expect(store.getState().app.verifyEmailModalOpened).toBe(false);
	});

	it("Should not reopen the modal after the user closes it", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderWithProviders(<VerifyEmailModal />, {
			preloadedState: {
				user: {
					isSignedIn: true,
					isOffline: false,
					userInformation: makeUserInformation({
						isEmailVerified: false,
					}),
				},
			},
		});

		// Act

		const closeButtons = screen.getAllByRole("button", { name: "Close" });
		await user.click(closeButtons[closeButtons.length - 1]);

		// Assert

		await waitFor(() =>
			expect(store.getState().app.verifyEmailModalOpened).toBe(false),
		);
	});
});
