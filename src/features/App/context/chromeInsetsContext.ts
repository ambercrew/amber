import { createContext, use } from "react";

/** How far (CSS) the header and footer currently cover the top and bottom of the screen, for scrollbars and overlays to stay clear of. */
export interface ChromeInsets {
	top: string;
	bottom: string;
	/** Timing to animate `top`/`bottom` changes with, so they move in step with the header and footer sliding. */
	transition: string;
}

const CHROME_TRANSITION_TIMING =
	"var(--app-shell-transition-duration) var(--app-shell-transition-timing-function)";

/** The insets for the header and footer being shown or hidden; `safeAreaBottom` always stays clear. */
export function chromeInsets(
	headerShown: boolean,
	footerShown: boolean,
	safeAreaBottom: string,
): ChromeInsets {
	return {
		top: headerShown ? "var(--app-shell-header-height, 0px)" : "0px",
		bottom: `calc(${footerShown ? "var(--app-shell-footer-height, 0px)" : "0px"} + ${safeAreaBottom})`,
		transition: `top ${CHROME_TRANSITION_TIMING}, bottom ${CHROME_TRANSITION_TIMING}`,
	};
}

// Outside the app shell there's no chrome to stay clear of.
export const ChromeInsetsContext = createContext<ChromeInsets>(
	chromeInsets(false, false, "0px"),
);

/** The space the header and footer take right now; follows them as they hide on scroll, in every view. */
export function useChromeInsets() {
	return use(ChromeInsetsContext);
}
