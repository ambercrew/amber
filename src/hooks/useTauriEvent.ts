import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

/** Listens for a backend-emitted Tauri event (fire-and-forget, no response
 * expected) for the lifetime of the calling component. */
export function useTauriEvent<TPayload>(
	event: string,
	handler: (payload: TPayload) => void,
) {
	// Kept in a ref so the subscription is only re-created when the event name
	// changes, while the handler still sees the latest render's state.
	const handlerRef = useRef(handler);

	useEffect(() => {
		handlerRef.current = handler;
	}, [handler]);

	useEffect(() => {
		const unlisten = listen<TPayload>(event, e => {
			handlerRef.current(e.payload);
		});

		return () => {
			void unlisten.then(f => f());
		};
	}, [event]);
}
