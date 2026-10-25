import { useCallback, useEffect, useId, useRef } from "react";
import useBeforeUnload from "../../../hooks/useBeforeUnload";
import { AUTO_SAVE_DELAY_IN_MILLISECONDS } from "../../../config/constants";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../stores/sync/managers/syncEventManager";
import { defaultCloseRequestedEventManager } from "../../../managers/closeRequestedEventManager";
import { CallApiFn } from "../../../hooks/useApi";

export const CLOSE_REQUESTED_HANDLER_NAME_PREFIX = "useAutoSave handler";

interface Props<T> {
	onSave: (content: T) => Promise<void>;
	onSaveComplete?: () => Promise<void>;
	callApi: CallApiFn;
}

interface ReturnValue<T> {
	saveChanges: () => Promise<void>;
	onContentUpdate: (getContent: () => T) => void;
}

/**
 * This hook is used to save an element's content automatically, with a
 * delay, after it gets updated.
 */
function useAutoSave<T = string>({
	onSave,
	onSaveComplete,
	callApi,
}: Props<T>): ReturnValue<T> {
	// Holds a getter for the latest content that is not yet saved. Producing
	// the content (e.g. serializing the editor state to JSON) can be
	// expensive on large documents, so it is deferred until a save actually
	// happens instead of running on every update.
	const pendingContent = useRef<(() => T) | null>(null);
	const autoSaveTimeoutId = useRef<number>(null);
	// Multiple ElementEditor instances (e.g. a card's front and back) can be
	// mounted at once, each with their own useAutoSave instance, so the
	// handler name must be unique per instance to avoid one instance's
	// close-requested handler overwriting another's.
	const closeRequestedHandlerName = `${CLOSE_REQUESTED_HANDLER_NAME_PREFIX}-${useId()}`;

	const saveChanges = useCallback(async () => {
		if (autoSaveTimeoutId.current !== null) {
			clearTimeout(autoSaveTimeoutId.current);
			autoSaveTimeoutId.current = null;
		}

		if (pendingContent.current === null) return;

		await callApi(async () => {
			const getContent = pendingContent.current!;
			pendingContent.current = null;

			await onSave(getContent());
			await onSaveComplete?.();
		});
	}, [callApi, onSave, onSaveComplete]);

	// Stable, so callers can depend on it without re-subscribing listeners every render.
	const handleContentUpdate = useCallback(
		(getContent: () => T) => {
			pendingContent.current = getContent;

			if (autoSaveTimeoutId.current !== null) {
				clearTimeout(autoSaveTimeoutId.current);
				autoSaveTimeoutId.current = null;
			}
			autoSaveTimeoutId.current = setTimeout(() => {
				void saveChanges();
			}, AUTO_SAVE_DELAY_IN_MILLISECONDS);
		},
		[saveChanges],
	);

	// Used for saving changes before unmounting.
	useEffect(() => {
		return () => void saveChanges();
	}, [saveChanges]);

	// Used for saving changes before closing the app.
	useEffect(() => {
		defaultCloseRequestedEventManager.addHandler(
			closeRequestedHandlerName,
			{
				cb: saveChanges,
				// Must be executed at start!
				priority: 0,
			},
		);
		return () =>
			defaultCloseRequestedEventManager.removeHandler(
				closeRequestedHandlerName,
			);
	}, [closeRequestedHandlerName, saveChanges]);

	// Used to save changes before syncing.
	useEffect(() => {
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PreSyncStart,
			saveChanges,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PreSyncStart,
				saveChanges,
			);
	}, [saveChanges]);

	// Used to get the latest content after sync.
	useEffect(() => {
		if (!onSaveComplete) return;

		defaultGlobalSyncEventManager.addListener(
			ListenerType.PreSyncComplete,
			onSaveComplete,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PreSyncComplete,
				onSaveComplete,
			);
	}, [onSaveComplete]);

	// Used to save changes before unloading.
	useBeforeUnload(e => {
		if (pendingContent.current !== null) e.preventDefault();
		void saveChanges();
	});

	return {
		saveChanges,
		onContentUpdate: handleContentUpdate,
	};
}

export default useAutoSave;
