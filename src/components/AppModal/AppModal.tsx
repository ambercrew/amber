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
 * Mantine's `Modal`, centered and, while full screen, padded clear of the mobile status and gesture
 * bars and closed by Android's back button.
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
							// A full-screen column, so a body using `flex`/`mt="auto"` reaches the bottom; only the body
							// scrolls, so the padding and header never pass under the status bar.
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
