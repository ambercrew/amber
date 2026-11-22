import { useCallback, useEffect } from "react";
import { loadCurrentElementAction } from "../stores/elements/elementsActions";
import { bumpElementRefreshCount } from "../stores/sync/syncReducer";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../managers/syncEventManager";
import useAppDispatch from "./useAppDispatch";
import { useElementParams } from "./useElementParams";

/**
 * Reloads the open element after a sync, so changes from another device reach the viewer and
 * the Aside panel, which share `elementDetails`/`currentElement`.
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
