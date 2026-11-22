/**
 * Whether the on-screen keyboard is suppressed while editing. It describes the device, not the
 * account, so it's in localStorage rather than the synced settings.
 */

const KEY = "virtualKeyboardSuppressed";

/** Suppression is on until the user asks for the keyboard: the reading and
 * extracting the app is built around needs the page, not an IME covering it. */
export function loadVirtualKeyboardSuppressed(): boolean {
	try {
		return localStorage.getItem(KEY) !== "false";
	} catch {
		return true;
	}
}

export function saveVirtualKeyboardSuppressed(suppressed: boolean): void {
	try {
		localStorage.setItem(KEY, String(suppressed));
	} catch {
		// Ignore quota failures — the preference just won't outlive the session.
	}
}
