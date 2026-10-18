import { useLayoutEffect } from "react";
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import ImageOcclusionEditor, {
	OcclusionEditorTarget,
} from "./ImageOcclusionEditor";
import { smallScreenQuery } from "../../../hooks/useIsSmallScreen";
import {
	SAFE_AREA_BOTTOM,
	SAFE_AREA_TOP,
	safeAreaVerticalStyle,
} from "../../../utils/safeArea";

interface ResponsiveOcclusionEditorProps {
	modalId: string;
	/** The modal's inset from each screen edge while not full screen. */
	margin: string;
	target: OcclusionEditorTarget;
	onSaved?: (occlusionId: string) => void;
}

/** Keeps its modal full screen exactly while the window is small, even as it's resized. */
export default function ResponsiveOcclusionEditor({
	modalId,
	margin,
	target,
	onSaved,
}: ResponsiveOcclusionEditorProps) {
	const theme = useMantineTheme();
	// Read synchronously, so the first render agrees with the size the modal opened at.
	const fullScreen = useMediaQuery(
		smallScreenQuery(theme.breakpoints),
		undefined,
		{ getInitialValueInEffect: false },
	);

	// Before paint, so a small screen never sees the inset modal flash first.
	// Full screen, it clears the status and gesture bars on mobile, as `AppModal` does.
	useLayoutEffect(() => {
		modals.updateModal({
			modalId,
			fullScreen,
			styles: {
				content: fullScreen ? safeAreaVerticalStyle() : undefined,
			},
		});
	}, [modalId, fullScreen]);

	return (
		<ImageOcclusionEditor
			target={target}
			// The insets are 0 on desktop, where no padding is added.
			height={
				fullScreen
					? `calc(100dvh - ${SAFE_AREA_TOP} - ${SAFE_AREA_BOTTOM})`
					: `calc(100dvh - 2 * ${margin})`
			}
			onSaved={onSaved}
			onClose={() => modals.close(modalId)}
		/>
	);
}
