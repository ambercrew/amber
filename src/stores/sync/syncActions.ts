import { addListener } from "@reduxjs/toolkit";
import { notifications } from "@mantine/notifications";
import { AppDispatch, RootState } from "../store";
import { sync as syncApi } from "../../api/sync/api/syncApi";
import errorToString from "../../utils/errorToString";
import {
	closeWithoutWaitingRequested,
	keepWorkingRequested,
	setIsFinishingBeforeClose,
	setIsSyncHeld,
	setIsSyncing,
	syncEnded,
} from "./syncReducer";
import { selectIsSyncLocked, selectIsSyncing } from "./syncSelectors";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../managers/syncEventManager";
import {
	selectIsOffline,
	selectIsSignedIn,
	selectUserInformation,
} from "../user/userSelectors";
import { setOnline } from "../user/userReducer";

export interface SyncOptions {
	skipIfKnownOffline?: boolean;
	/** Waits out a running sync and runs one after it instead of joining it, so what was written meanwhile is pushed. */
	afterRunning?: boolean;
}

/** Resolves when the running sync (or `withoutSync` operation) ends. Loop on `selectIsSyncLocked`, as another waiter may claim it first. */
function syncLockReleased(dispatch: AppDispatch): Promise<void> {
	return new Promise(resolve => {
		const unsubscribe = dispatch(
			addListener({
				predicate: (_action, current, previous) =>
					selectIsSyncLocked(previous as RootState) &&
					!selectIsSyncLocked(current as RootState),
				effect: () => {
					unsubscribe();
					resolve();
				},
			}),
		);
	});
}

/** Resolves with the running sync's result once it ends. */
function runningSyncEnded(dispatch: AppDispatch): Promise<boolean> {
	return new Promise(resolve => {
		const unsubscribe = dispatch(
			addListener({
				actionCreator: syncEnded,
				effect: action => {
					unsubscribe();
					resolve(action.payload);
				},
			}),
		);
	});
}

function canSync(state: RootState) {
	return (
		selectIsSignedIn(state) &&
		!!selectUserInformation(state)?.isEmailVerified
	);
}

/**
 * Runs a sync in the background; requested while one runs, it waits for that one instead of starting
 * another, unless `afterRunning`. Resolves true once the sync finished, false when it was skipped or failed.
 */
export function sync(options?: SyncOptions) {
	return async function (
		dispatch: AppDispatch,
		getState: () => RootState,
	): Promise<boolean> {
		if (!canSync(getState())) return false;

		if (options?.skipIfKnownOffline && selectIsOffline(getState())) {
			notifications.show({
				message:
					"You're offline — sync will resume once you're back online.",
				color: "yellow",
			});
			return false;
		}

		// Only the sync running now started too early; one starting after it can be joined.
		let mustOutwait =
			!!options?.afterRunning && selectIsSyncing(getState());
		while (selectIsSyncLocked(getState())) {
			if (selectIsSyncing(getState()) && !mustOutwait)
				return runningSyncEnded(dispatch);
			await syncLockReleased(dispatch);
			mustOutwait = false;
		}
		// What ran meanwhile (a sign-out, say) may have left nothing to sync.
		if (!canSync(getState())) return false;
		// Claimed with no await since the check, so a sync queued behind this one keeps waiting.
		dispatch(setIsSyncing(true));
		// Unknown unless the sync succeeds, as a failed one may have applied some batches.
		let changedKeys: string[] | null = null;
		let succeeded = false;
		try {
			await defaultGlobalSyncEventManager.notifyListeners(
				ListenerType.PreSyncStart,
			);
			({ changedKeys } = await syncApi());
			dispatch(setOnline());
			notifications.show({ message: "Sync complete", autoClose: 1000 });
			succeeded = true;
			return true;
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error(e);
			notifications.show({ message: errorToString(e), color: "red" });
			return false;
		} finally {
			try {
				await defaultGlobalSyncEventManager.notifyListeners(
					ListenerType.PreSyncComplete,
				);
			} catch (e) {
				// Logged, not rethrown: the lock below must be released, or every later sync waits forever.
				// eslint-disable-next-line no-console
				console.error(e);
			}
			dispatch(syncEnded(succeeded));
			try {
				await defaultGlobalSyncEventManager.notifyListeners(
					ListenerType.PostSyncComplete,
					{ changedKeys },
				);
			} catch (e) {
				// Logged, not rethrown, so a sync never rejects: callers run it in the background.
				// eslint-disable-next-line no-console
				console.error(e);
			}
		}
	};
}

/** Resolves once the user makes `choice` in the syncing dialog; `cancel` stops listening. */
function userChoice(
	dispatch: AppDispatch,
	choice: typeof closeWithoutWaitingRequested | typeof keepWorkingRequested,
) {
	let unsubscribe: (() => void) | undefined;
	const requested = new Promise<void>(resolve => {
		unsubscribe = dispatch(
			addListener({
				actionCreator: choice,
				effect: () => {
					unsubscribe?.();
					resolve();
				},
			}),
		);
	});
	return { requested, cancel: () => unsubscribe?.() };
}

/**
 * Holds a close (or a mobile suspend) behind the running sync, showing the syncing dialog, then runs one
 * more when `runSync`, so edits made during the running one are pushed too. The user may stop waiting,
 * or keep working, which resolves `false` so the app stays open while the sync goes on.
 */
export function syncBeforeClose(runSync: boolean) {
	return async function (
		dispatch: AppDispatch,
		getState: () => RootState,
	): Promise<boolean> {
		// No dialog when nothing would run, e.g. auto sync on while signed out.
		const syncWouldRun = runSync && canSync(getState());
		if (!syncWouldRun && !selectIsSyncing(getState())) return true;

		dispatch(setIsFinishingBeforeClose(true));
		const skip = userChoice(dispatch, closeWithoutWaitingRequested);
		const keepWorking = userChoice(dispatch, keepWorkingRequested);
		const finished = (async () => {
			if (syncWouldRun) await dispatch(sync({ afterRunning: true }));
			else
				while (selectIsSyncing(getState()))
					await syncLockReleased(dispatch);
		})();
		try {
			return await Promise.race([
				finished.then(() => true),
				skip.requested.then(() => true),
				keepWorking.requested.then(() => false),
			]);
		} finally {
			skip.cancel();
			keepWorking.cancel();
			dispatch(setIsFinishingBeforeClose(false));
		}
	};
}

/**
 * Runs `operation` (e.g. one switching the backend's database) after the running sync, with none starting
 * meanwhile. It holds syncs off without `isSyncing`, so the sync button doesn't spin.
 */
export function withoutSync<T>(operation: () => Promise<T>) {
	return async function (
		dispatch: AppDispatch,
		getState: () => RootState,
	): Promise<T> {
		while (selectIsSyncLocked(getState())) await syncLockReleased(dispatch);
		// Claimed with no await since the check; a sync queued meanwhile waits for the release.
		dispatch(setIsSyncHeld(true));
		try {
			return await operation();
		} finally {
			dispatch(setIsSyncHeld(false));
		}
	};
}
