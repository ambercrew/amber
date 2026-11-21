import { CSSProperties } from "react";
import { isMobile } from "./tauriUtils";

/** Height of the status bar / notch that mobile webviews draw underneath. */
export const SAFE_AREA_TOP = "env(safe-area-inset-top)";

/** Height of the gesture bar / home indicator that mobile webviews draw above. */
export const SAFE_AREA_BOTTOM = "env(safe-area-inset-bottom)";

/**
 * Padding that clears the status bar for anything drawn at the very top of a
 * mobile screen. Undefined on desktop, where nothing overlaps the window.
 */
export function safeAreaTopStyle(): CSSProperties | undefined {
	return isMobile() ? { paddingTop: SAFE_AREA_TOP } : undefined;
}

/**
 * Padding that clears the gesture bar for anything drawn at the very bottom of
 * a mobile screen. Undefined on desktop.
 */
export function safeAreaBottomStyle(): CSSProperties | undefined {
	return isMobile() ? { paddingBottom: SAFE_AREA_BOTTOM } : undefined;
}

/**
 * Padding that clears both the status bar and the gesture bar for anything
 * spanning the full height of a mobile screen. Undefined on desktop.
 */
export function safeAreaVerticalStyle(): CSSProperties | undefined {
	return isMobile()
		? { ...safeAreaTopStyle(), ...safeAreaBottomStyle() }
		: undefined;
}

const SAFE_AREA_TOP_PROBE_ID = "safe-area-top-probe";

/** {@link SAFE_AREA_TOP} in px, for scroll math that can't use CSS. 0 on desktop. */
export function safeAreaTopInPx(): number {
	if (!isMobile()) return 0;
	// Kept in the document, so it's created once and measured on each call.
	let probe = document.getElementById(SAFE_AREA_TOP_PROBE_ID);
	if (!probe) {
		probe = document.createElement("div");
		probe.id = SAFE_AREA_TOP_PROBE_ID;
		Object.assign(probe.style, {
			position: "fixed",
			visibility: "hidden",
			pointerEvents: "none",
			height: SAFE_AREA_TOP,
		});
		document.body.appendChild(probe);
	}
	return probe.offsetHeight;
}
