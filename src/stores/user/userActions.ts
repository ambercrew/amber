import { NavigateFunction } from "react-router";
import {
	isSignedIn as isSignedInApi,
	signIn as signInApi,
	signInWithGoogle as signInWithGoogleApi,
	signUp as signUpApi,
	signOut as signOutApi,
	verifyUserEmail as verifyUserEmailApi,
	resendEmailVerificationCode as resendEmailVerificationCodeApi,
	updatePassword as updatePasswordApi,
} from "../../api/backend/api/authApi";
import {
	getUserInformation,
	updateUserInformation as updateUserInformationApi,
	deleteUser as deleteUserApi,
} from "../../api/backend/api/userApi";
import { reloadApplicationState } from "../app/appActions";
import { withoutSync } from "../sync/syncActions";
import { AppDispatch } from "../store";
import {
	setLoggedOf,
	setOfflineUserInformation,
	setUserInformation,
} from "./userReducer";
import SignUpRequestDto from "../../api/backend/dto/signUpRequestDto";
import { notifications } from "@mantine/notifications";
import errorToString from "../../utils/errorToString";
import {
	clearCachedUserInformation,
	loadCachedUserInformation,
	saveCachedUserInformation,
} from "./userInformationCache";

export function loadUserState() {
	return async function (dispatch: AppDispatch): Promise<void> {
		const isSignedIn = await isSignedInApi();
		if (!isSignedIn) {
			clearCachedUserInformation();
			return;
		}

		// Show the last known profile at once (as offline) rather than looking signed out while
		// the call below, which can retry for a while, is pending.
		const cached = loadCachedUserInformation();
		if (cached) dispatch(setOfflineUserInformation(cached));

		try {
			const userInformation = await getUserInformation();
			saveCachedUserInformation(userInformation);
			dispatch(setUserInformation(userInformation));
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error(e);
		}
	};
}

export function signIn(
	navigate: NavigateFunction,
	username: string,
	password: string,
) {
	return async function (dispatch: AppDispatch): Promise<void> {
		const userInformation = await signInApi(username, password);
		await dispatch(reloadApplicationState(navigate, userInformation));
	};
}

export function signInWithGoogle(navigate: NavigateFunction) {
	return async function (dispatch: AppDispatch): Promise<void> {
		const userInformation = await signInWithGoogleApi();
		await dispatch(reloadApplicationState(navigate, userInformation));
	};
}

export function signUp(navigate: NavigateFunction, request: SignUpRequestDto) {
	return async function (dispatch: AppDispatch): Promise<void> {
		const userInformation = await signUpApi(request);
		await dispatch(reloadApplicationState(navigate, userInformation));
	};
}

export function signOut(navigate: NavigateFunction) {
	return async function (dispatch: AppDispatch): Promise<void> {
		try {
			// Signing out switches the backend to another database, which mustn't happen mid-sync.
			await dispatch(
				withoutSync(() => signedOutAfter(signOutApi, dispatch)),
			);
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error(e);
			notifications.show({ message: errorToString(e), color: "red" });
			return;
		}
		await dispatch(reloadApplicationState(navigate));
	};
}

export function verifyEmail(verificationCode: string) {
	return async function (dispatch: AppDispatch): Promise<void> {
		await verifyUserEmailApi(verificationCode);
		const userInformation = await getUserInformation();
		saveCachedUserInformation(userInformation);
		dispatch(setUserInformation(userInformation));
	};
}

export function resendEmailVerificationCode() {
	return async function (): Promise<void> {
		await resendEmailVerificationCodeApi();
	};
}

export function updateUserInformation(firstName: string, lastName: string) {
	return async function (dispatch: AppDispatch): Promise<void> {
		await updateUserInformationApi(firstName, lastName);
		const userInformation = await getUserInformation();
		saveCachedUserInformation(userInformation);
		dispatch(setUserInformation(userInformation));
	};
}

export function updateUserPassword(oldPassword: string, newPassword: string) {
	return async function (): Promise<void> {
		await updatePasswordApi(oldPassword, newPassword);
	};
}

export function deleteAccount(navigate: NavigateFunction) {
	return async function (dispatch: AppDispatch): Promise<void> {
		await dispatch(
			withoutSync(() => signedOutAfter(deleteUserApi, dispatch)),
		);
		await dispatch(reloadApplicationState(navigate));
	};
}

/** Runs `leave` and marks the user signed out, inside `withoutSync`, so a sync queued behind it sees them gone. */
async function signedOutAfter(
	leave: () => Promise<unknown>,
	dispatch: AppDispatch,
) {
	await leave();
	clearCachedUserInformation();
	dispatch(setLoggedOf());
}
