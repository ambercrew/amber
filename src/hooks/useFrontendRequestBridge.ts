import {
	rejectFrontendRequest,
	resolveFrontendRequest,
} from "../api/common/api/commonApi";
import { useTauriEvent } from "./useTauriEvent";

export interface FrontendRequestEvent {
	requestId: string;
}

/**
 * Answers backend requests: runs `handler` on each `event`'s payload and reports the result through
 * `resolve_frontend_request` under its request id, or `reject_frontend_request` if `handler` throws.
 */
export function useFrontendRequestBridge<TEvent extends FrontendRequestEvent>(
	event: string,
	handler: (payload: TEvent) => Promise<string> | string,
) {
	useTauriEvent<TEvent>(event, payload => {
		void (async () => {
			let response: string;
			try {
				response = await handler(payload);
			} catch (error) {
				// A failed handler (e.g. a lazy chunk that won't load) fails the request now, not at its timeout.
				await rejectFrontendRequest(payload.requestId, String(error));
				return;
			}
			await resolveFrontendRequest(payload.requestId, response);
		})();
	});
}
