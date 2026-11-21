import { invoke } from "@tauri-apps/api/core";

export function resolveFrontendRequest(
	requestId: string,
	response: string,
): Promise<void> {
	return invoke("resolve_frontend_request", { requestId, response });
}

export function rejectFrontendRequest(
	requestId: string,
	message: string,
): Promise<void> {
	return invoke("reject_frontend_request", { requestId, message });
}
