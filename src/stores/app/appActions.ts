import { NavigateFunction } from "react-router";
import { loadSettings, saveSettings } from "../settings/settingsActions";
import { buildUpdateSettingsRequest } from "../../api/settings/dto/updateSettingsRequestDto";
import { AppDispatch, RootState } from "../store";
import { sync } from "../sync/syncActions";
import { loadUserState } from "../user/userActions";
import { UserInformationDto } from "../../api/backend/dto/userInformationDto";
import { setUserInformation } from "../user/userReducer";
import { saveCachedUserInformation } from "../user/userInformationCache";
import {
	selectIsVirtualKeyboardSuppressed,
	selectStartedInitialStateLoading,
} from "./appSelectors";
import {
	markStartLoadingOfInitialState,
	setVirtualKeyboardSuppressed,
} from "./appReducer";
import { saveVirtualKeyboardSuppressed } from "./virtualKeyboardStorage";
import { loadElementTree } from "../elements/elementsActions";
import { setCurrentElement } from "../elements/elementsReducer";

export function initialLoadApplicationState() {
	return async function (
		dispatch: AppDispatch,
		getState: () => RootState,
	): Promise<void> {
		if (selectStartedInitialStateLoading(getState())) return;
		dispatch(markStartLoadingOfInitialState());
		await loadAppState(dispatch);
	};
}

/** A common action that reloads the application state,
 * as if you have refreshed the web page.*/
export function reloadApplicationState(
	navigate: NavigateFunction,
	userInformationDto?: UserInformationDto,
) {
	return async function (dispatch: AppDispatch): Promise<void> {
		await loadAppState(dispatch, navigate, userInformationDto);
	};
}

/** Persists a new database directory and reloads the application state:
 * the backend reconnects to the database in the new directory, so its contents
 * must be reloaded. */
export function changeDatabaseDirectory(
	directory: string,
	navigate: NavigateFunction,
) {
	return async function (dispatch: AppDispatch): Promise<void> {
		await dispatch(
			saveSettings(
				buildUpdateSettingsRequest({
					baseDatabaseDirectory: directory,
				}),
			),
		);
		await dispatch(reloadApplicationState(navigate));
	};
}

/** Turns the on-screen keyboard suppression on or off, remembering the choice
 * for the next time the app starts on this device. */
export function setVirtualKeyboardSuppressedAction(suppressed: boolean) {
	return function (dispatch: AppDispatch, getState: () => RootState): void {
		if (selectIsVirtualKeyboardSuppressed(getState()) === suppressed)
			return;
		// Drop focus as well, so a keyboard that is already up goes away at
		// once instead of lingering until the user taps elsewhere.
		if (suppressed) {
			(document.activeElement as HTMLElement | null)?.blur();
		}
		saveVirtualKeyboardSuppressed(suppressed);
		dispatch(setVirtualKeyboardSuppressed(suppressed));
	};
}

async function loadAppState(
	dispatch: AppDispatch,
	navigate?: NavigateFunction,
	userInformationDto?: UserInformationDto,
) {
	const settings = await dispatch(loadSettings());

	if (navigate) {
		// The previously open element may not exist in the reloaded state
		// (e.g. after switching database directories), so clear it.
		dispatch(setCurrentElement(null));
		await navigate("/");
	}

	// Load elements in parallel with the user/sync calls below, so a slow or
	// unreachable backend never delays showing the user's local content.
	const elementTreePromise = dispatch(loadElementTree());

	if (userInformationDto) {
		saveCachedUserInformation(userInformationDto);
		dispatch(setUserInformation(userInformationDto));
	} else {
		await dispatch(loadUserState());
	}

	// Sync on app close is registered as an event by the SettingsSync component.
	if (settings?.autoSync) await dispatch(sync({ skipIfKnownOffline: true }));

	// Re-check the user's profile once more now that sync may have confirmed
	// connectivity, so a transient offline state at startup doesn't linger
	// for the rest of the session.
	if (!userInformationDto) await dispatch(loadUserState());

	await elementTreePromise;
}
