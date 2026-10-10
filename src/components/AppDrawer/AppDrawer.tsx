import { Drawer, DrawerProps } from "@mantine/core";
import useBackButtonPress from "../../hooks/useBackButtonPress";
import { BackButtonPriority } from "../../managers/backButtonManager";
import {
	safeAreaBottomStyle,
	safeAreaTopStyle,
	safeAreaVerticalStyle,
} from "../../utils/safeArea";

/** `styles` is owned by this component, which uses it for the safe area. */
export type AppDrawerProps = Omit<DrawerProps, "styles">;

/**
 * Mantine's `Drawer` with the app's defaults: padded so it clears the status
 * and gesture bars on mobile and closed by Android's back button. A drawer
 * outranks the modal it may be opened from, so back closes the drawer first.
 */
function AppDrawer({
	closeButtonProps,
	closeOnEscape = true,
	position = "left",
	opened,
	onClose,
	...others
}: AppDrawerProps) {
	useBackButtonPress(
		onClose,
		opened && closeOnEscape,
		BackButtonPriority.High,
	);

	// Only pad the edges that touch the screen's top and bottom.
	const safeArea =
		position === "top"
			? safeAreaTopStyle()
			: position === "bottom"
				? safeAreaBottomStyle()
				: safeAreaVerticalStyle();

	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			position={position}
			closeOnEscape={closeOnEscape}
			closeButtonProps={{ "aria-label": "Close", ...closeButtonProps }}
			styles={{ content: safeArea }}
			{...others}
		/>
	);
}

export default AppDrawer;
