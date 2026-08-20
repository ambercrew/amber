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
import { AppDispatch } from "../store";
import { setLoggedOf, setUserInformation } from "./userReducer";
import SignUpRequestDto from "../../api/backend/dto/signUpRequestDto";
import { notifications } from "@mantine/notifications";
import errorToString from "../../utils/errorToString";

export function loadUserState() {
	return async function (dispatch: AppDispatch): Promise<void> {
		try {
			const isSignedIn = await isSignedInApi();
			if (!isSignedIn) return;
			const userInformation = await getUserInformation();
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
			await signOutApi();
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error(e);
			notifications.show({ message: errorToString(e), color: "red" });
			return;
		}
		dispatch(setLoggedOf());
		await dispatch(reloadApplicationState(navigate));
	};
}

export function verifyEmail(verificationCode: string) {
	return async function (dispatch: AppDispatch): Promise<void> {
		await verifyUserEmailApi(verificationCode);
		const userInformation = await getUserInformation();
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
		await deleteUserApi();
		dispatch(setLoggedOf());
		await dispatch(reloadApplicationState(navigate));
	};
}
