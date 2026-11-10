import { notifications } from "@mantine/notifications";
import { AppDispatch, RootState } from "../store";
import { sync as syncApi } from "../../api/sync/api/syncApi";
import errorToString from "../../utils/errorToString";
import { setIsSyncing } from "./syncReducer";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "./managers/syncEventManager";
import {
	selectIsOffline,
	selectIsSignedIn,
	selectUserInformation,
} from "../user/userSelectors";
import { setOnline } from "../user/userReducer";

export interface SyncOptions {
	skipIfKnownOffline?: boolean;
}

/** Resolves true once a sync finished, false when it was skipped or failed. */
export function sync(options?: SyncOptions) {
	return async function (
		dispatch: AppDispatch,
		getState: () => RootState,
	): Promise<boolean> {
		if (
			!selectIsSignedIn(getState()) ||
			!selectUserInformation(getState())?.isEmailVerified
		) {
			return false;
		}

		if (options?.skipIfKnownOffline && selectIsOffline(getState())) {
			notifications.show({
				message:
					"You're offline — sync will resume once you're back online.",
				color: "yellow",
			});
			return false;
		}

		try {
			await defaultGlobalSyncEventManager.notifyListeners(
				ListenerType.PreSyncStart,
			);
			dispatch(setIsSyncing(true));
			await syncApi();
			dispatch(setOnline());
			notifications.show({ message: "Sync complete", autoClose: 1000 });
			return true;
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error(e);
			notifications.show({ message: errorToString(e), color: "red" });
			return false;
		} finally {
			await defaultGlobalSyncEventManager.notifyListeners(
				ListenerType.PreSyncComplete,
			);
			dispatch(setIsSyncing(false));
			await defaultGlobalSyncEventManager.notifyListeners(
				ListenerType.PostSyncComplete,
			);
		}
	};
}
