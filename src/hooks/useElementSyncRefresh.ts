import { useCallback, useEffect } from "react";
import { elementExists, getElementById } from "../api/elements/api/elementsApi";
import { setCurrentElement } from "../stores/elements/elementsReducer";
import { loadElementDetailsAction } from "../stores/elementDetails/elementDetailsActions";
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

		const exists = await elementExists(params);
		if (!exists) return;

		const element = await getElementById(params);
		dispatch(setCurrentElement(element));
		await dispatch(loadElementDetailsAction(params));
		dispatch(bumpElementRefreshCount());
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
