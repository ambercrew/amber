import { useCallback, useEffect } from "react";
import { loadCurrentElementAction } from "../stores/elements/elementsActions";
import { bumpElementRefreshCount } from "../stores/sync/syncReducer";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
	SyncResult,
} from "../managers/syncEventManager";
import useAppDispatch from "./useAppDispatch";
import { useElementParams } from "./useElementParams";

const MAX_RELOAD_ATTEMPTS = 3;

/** Saves the open element's unsaved edits, resolving whether there were any. */
async function savePendingEdits() {
	const saved = await defaultGlobalSyncEventManager.notifyListeners(
		ListenerType.PreSyncComplete,
	);
	return saved.includes(true);
}

/**
 * Reloads the open element after a sync that changed it, so changes from another device reach the
 * viewer and the Aside panel, which share `elementDetails`/`currentElement`.
 */
export function useElementSyncRefresh() {
	const params = useElementParams();
	const dispatch = useAppDispatch();

	const refresh = useCallback(
		async (result?: SyncResult) => {
			if (!params) return;
			// Remounting interrupts typing, so an element the sync didn't change keeps its editors.
			const changedKeys = result?.changedKeys ?? null;
			if (changedKeys && !changedKeys.includes(params.id)) return;
			for (let attempt = 1; ; attempt++) {
				if (!(await dispatch(loadCurrentElementAction(params)))) return;
				// What was typed while it loaded is saved now and loaded again, so the remount keeps it.
				if (!(await savePendingEdits())) break;
				// Still typing: keep the editors rather than reload under the user indefinitely.
				if (attempt === MAX_RELOAD_ATTEMPTS) return;
			}
			dispatch(bumpElementRefreshCount());
		},
		[params, dispatch],
	);

	useEffect(() => {
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PostSyncComplete,
			refresh,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PostSyncComplete,
				refresh,
			);
	}, [refresh]);
}
