import { Modal, ModalProps } from "@mantine/core";
import { useIsSmallScreen } from "../../hooks/useIsSmallScreen";
import useBackButtonPress from "../../hooks/useBackButtonPress";
import { BackButtonPriority } from "../../managers/backButtonManager";
import { safeAreaVerticalStyle } from "../../utils/safeArea";

/** `styles` is owned by this component, which uses it for the safe area. */
export type AppModalProps = Omit<ModalProps, "styles"> & {
	/** Go full screen once the viewport is too small for a dialog. */
	fullScreenOnSmallScreen?: boolean;
};

/**
 * Mantine's `Modal` with the app's defaults: centered, and — while full
 * screen — padded so it clears the status and gesture bars on mobile and
 * closed by Android's back button.
 */
function AppModal({
	fullScreen = false,
	fullScreenOnSmallScreen = false,
	centered = true,
	closeButtonProps,
	closeOnEscape = true,
	opened,
	onClose,
	...others
}: AppModalProps) {
	const isSmallScreen = useIsSmallScreen();
	const isFullScreen =
		fullScreen || (fullScreenOnSmallScreen && isSmallScreen);

	// An open modal takes the back button so it dismisses the modal rather than
	// navigating. Modals that refuse escape refuse back too.
	useBackButtonPress(
		onClose,
		opened && closeOnEscape,
		BackButtonPriority.Medium,
	);

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			fullScreen={isFullScreen}
			centered={centered}
			closeOnEscape={closeOnEscape}
			closeButtonProps={{ "aria-label": "Close", ...closeButtonProps }}
			styles={
				isFullScreen
					? {
							// A column that fills the screen, so a body laid
							// out with `flex`/`mt="auto"` reaches the bottom.
							// Only the body scrolls, so the safe-area padding
							// and header never scroll under the status bar.
							content: {
								...safeAreaVerticalStyle(),
								display: "flex",
								flexDirection: "column",
								overflow: "hidden",
							},
							body: {
								flex: 1,
								display: "flex",
								flexDirection: "column",
								minHeight: 0,
								overflowY: "auto",
							},
						}
					: undefined
			}
			{...others}
		/>
	);
}

export default AppModal;
