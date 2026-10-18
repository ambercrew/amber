import { useCallback, useEffect } from "react";
import useAppDispatch from "./useAppDispatch";
import { loadElementTree } from "../stores/elements/elementsActions";
import { refreshBibliographicalSourcesAction } from "../stores/bibliographicalSources/bibliographicalSourcesActions";
import { loadTrash } from "../stores/trash/trashActions";
import { refreshAiPromptsAction } from "../stores/aiPrompts/aiPromptsActions";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../stores/sync/managers/syncEventManager";

/**
 * Refreshes global app state that a sync can change from another device —
 * the element tree, bibliographical sources, trash, and AI prompts — once a sync
 * completes.
 */
export function usePostSyncRefresh() {
	const dispatch = useAppDispatch();

	const refresh = useCallback(async () => {
		await Promise.all([
			dispatch(loadElementTree()),
			dispatch(refreshBibliographicalSourcesAction()),
			dispatch(loadTrash()),
			dispatch(refreshAiPromptsAction()),
		]);
	}, [dispatch]);

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
