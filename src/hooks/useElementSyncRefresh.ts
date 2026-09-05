import { useCallback, useEffect } from "react";
import { loadCurrentElementAction } from "../stores/elements/elementsActions";
import { bumpElementRefreshCount } from "../stores/sync/syncReducer";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../stores/sync/managers/syncEventManager";
import useAppDispatch from "./useAppDispatch";
import { useElementParams } from "./useElementParams";

/**
 * Reloads the currently open element after a sync completes, so that
 * changes pulled in from another device are reflected instead of leaving
 * stale content in the viewer and the Aside panel (which read the same
 * `elementDetails`/`currentElement` state regardless of route).
 */
export function useElementSyncRefresh() {
	const params = useElementParams();
	const dispatch = useAppDispatch();

	const refresh = useCallback(async () => {
		if (!params) return;
		const loaded = await dispatch(loadCurrentElementAction(params));
		if (loaded) dispatch(bumpElementRefreshCount());
	}, [params, dispatch]);

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
