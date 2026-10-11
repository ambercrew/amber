import { useLayoutEffect } from "react";
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import ImageOcclusionEditor, {
	OcclusionEditorTarget,
} from "./ImageOcclusionEditor";
import { smallScreenQuery } from "../../../hooks/useIsSmallScreen";

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
	useLayoutEffect(() => {
		modals.updateModal({ modalId, fullScreen });
	}, [modalId, fullScreen]);

	return (
		<ImageOcclusionEditor
			target={target}
			height={fullScreen ? "100dvh" : `calc(100dvh - 2 * ${margin})`}
			onSaved={onSaved}
			onClose={() => modals.close(modalId)}
		/>
	);
}
