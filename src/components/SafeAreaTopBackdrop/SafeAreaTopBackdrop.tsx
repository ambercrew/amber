import { Box } from "@mantine/core";
import { isMobile } from "../../utils/tauriUtils";
import { SAFE_AREA_TOP } from "../../utils/safeArea";

/**
 * Android draws the webview under the status bar, and the header covering it slides away on scroll,
 * so this strip keeps that area opaque whatever the header does.
 */
function SafeAreaTopBackdrop() {
	if (!isMobile()) return null;

	return (
		<Box
			bg="var(--mantine-color-body)"
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				height: SAFE_AREA_TOP,
				zIndex: 101,
				pointerEvents: "none",
			}}
		/>
	);
}

export default SafeAreaTopBackdrop;
