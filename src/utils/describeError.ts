import { isRouteErrorResponse } from "react-router";

function stringify(e: unknown): string {
	if (typeof e === "string") return e;
	try {
		return JSON.stringify(e) ?? String(e);
	} catch {
		return String(e);
	}
}

/** Formats a thrown value for the log, keeping an `Error`'s stack and a plain object's fields. */
function describeError(e: unknown): string {
	if (e instanceof Error) return e.stack ?? `${e.name}: ${e.message}`;
	if (isRouteErrorResponse(e)) return `${e.status} ${e.statusText}`.trim();
	return stringify(e);
}

/** Formats a thrown value for the user: an error's message, or a route response's status. */
export function errorMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	if (isRouteErrorResponse(e)) return `${e.status} ${e.statusText}`.trim();
	if (
		typeof e === "object" &&
		e !== null &&
		"message" in e &&
		typeof e.message === "string"
	)
		return e.message;
	return stringify(e);
}

export default describeError;
