/**
 * Whether the on-screen keyboard is suppressed while editing. It describes the
 * device in front of the user (a tablet being read on, say) rather than the
 * account, so it lives in localStorage instead of the synced settings.
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
