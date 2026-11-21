import { type CSSProperties } from "react";
import { rem } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import notificationsClasses from "./Notifications.module.css";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectIsFooterShown } from "../../../stores/app/appSelectors";
import { HEADER_AND_FOOTER_HEIGHT } from "../../../config/layout";
import { SAFE_AREA_BOTTOM } from "../../../utils/safeArea";

/** Mantine's notifications, kept above the study session footer while it's shown. */
export default function AppNotifications() {
	const footerShown = useAppSelector(selectIsFooterShown);

	return (
		<Notifications
			classNames={notificationsClasses}
			// Portaled outside the AppShell, so its scoped --app-shell-footer-height isn't visible here.
			style={
				{
					"--notifications-chrome-bottom": `calc(${
						footerShown ? rem(HEADER_AND_FOOTER_HEIGHT) : "0px"
					} + ${SAFE_AREA_BOTTOM})`,
				} as CSSProperties
			}
		/>
	);
}
