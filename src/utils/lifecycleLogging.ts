import { error as logError, info } from "@tauri-apps/plugin-log";
import describeError from "./describeError";

/** Logs visibility changes and uncaught errors, so the log shows whether the page was alive on resume. */
export function installLifecycleLogging() {
	document.addEventListener("visibilitychange", () => {
		void info(`Page ${document.visibilityState}`);
	});
	window.addEventListener("error", event => {
		void logError(
			`Uncaught error: ${describeError(event.error ?? event.message)}`,
		);
	});
	window.addEventListener("unhandledrejection", event => {
		void logError(`Unhandled rejection: ${describeError(event.reason)}`);
	});
}
