import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { resolveFrontendRequest } from "../api/common/api/commonApi";

export interface FrontendRequestEvent {
	requestId: string;
}

/**
 * Answers a backend request call: listens for `event`,
 * runs `handler` on its payload, and reports the result back via
 * `resolve_frontend_request` under the same request id — the frontend
 * counterpart of the backend's generic request/response bridge.
 */
export function useFrontendRequestBridge<TEvent extends FrontendRequestEvent>(
	event: string,
	handler: (payload: TEvent) => Promise<string> | string,
) {
	useEffect(() => {
		const unlisten = listen<TEvent>(event, e => {
			void (async () => {
				const response = await handler(e.payload);
				await resolveFrontendRequest(e.payload.requestId, response);
			})();
		});

		return () => {
			void unlisten.then(f => f());
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [event]);
}
