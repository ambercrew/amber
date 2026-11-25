import { useEffect, useRef } from "react";
import { useDebouncedCallback } from "@mantine/hooks";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../managers/syncEventManager";

/** A debounced `write` whose pending call runs, and is awaited, before a sync's refresh reloads the element. */
export function useSyncFlushedDebouncedCallback<A extends unknown[]>(
	write: (...args: A) => Promise<unknown>,
	delay: number,
) {
	const lastWrite = useRef<Promise<unknown>>(Promise.resolve());
	const debounced = useDebouncedCallback((...args: A) => {
		lastWrite.current = write(...args);
	}, delay);

	useEffect(() => {
		// Resolves whether a write was pending, so the refresh knows to reload once more.
		const flush = async () => {
			const pending = debounced.isPending();
			debounced.flush();
			// The write reports its own failure; the sync mustn't fail with it.
			await lastWrite.current.catch(() => undefined);
			return pending;
		};
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PreSyncComplete,
			flush,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PreSyncComplete,
				flush,
			);
	}, [debounced]);

	return debounced;
}
