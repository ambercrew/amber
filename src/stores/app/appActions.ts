import { NavigateFunction } from "react-router";
import { loadSettings, saveSettings } from "../settings/settingsActions";
import { buildUpdateSettingsRequest } from "../../api/settings/dto/updateSettingsRequestDto";
import { AppDispatch, RootState } from "../store";
import { sync } from "../sync/syncActions";
import { loadUserState } from "../user/userActions";
import { UserInformationDto } from "../../api/backend/dto/userInformationDto";
import { setUserInformation } from "../user/userReducer";
import { selectStartedInitialStateLoading } from "./appSelectors";
import { markStartLoadingOfInitialState } from "./appReducer";
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

async function loadAppState(
	dispatch: AppDispatch,
	navigate?: NavigateFunction,
	userInformationDto?: UserInformationDto,
) {
	const settings = await dispatch(loadSettings());

	if (userInformationDto) {
		dispatch(setUserInformation(userInformationDto));
	} else {
		await dispatch(loadUserState());
	}

	// Sync on app close is registered as an event by the SettingsSync component.
	if (settings?.autoSync) await dispatch(sync());

	if (navigate) {
		// The previously open element may not exist in the reloaded state
		// (e.g. after switching database directories), so clear it.
		dispatch(setCurrentElement(null));
		await navigate("/");
	}

	await dispatch(loadElementTree());
}
