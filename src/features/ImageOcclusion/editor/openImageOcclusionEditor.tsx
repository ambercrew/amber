import { FocusTrap } from "@mantine/core";
import { modals } from "@mantine/modals";
import { OcclusionEditorTarget } from "./ImageOcclusionEditor";
import ResponsiveOcclusionEditor from "./ResponsiveOcclusionEditor";
import { ModalHotkeysContext } from "../../../commands/useAppHotkeys";

// Inset on big screens, so the editor's close button isn't mistaken for the window's own.
const SCREEN_MARGIN = "var(--mantine-spacing-xl)";

/** Opens the mask editor (full screen on small screens); usable outside React (e.g. from a command). */
export function openImageOcclusionEditor(
	target: OcclusionEditorTarget,
	onSaved?: (occlusionId: string) => void,
) {
	const modalId = crypto.randomUUID();
	modals.open({
		modalId,
		centered: true,
		size: "100%",
		xOffset: SCREEN_MARGIN,
		yOffset: SCREEN_MARGIN,
		withCloseButton: false,
		// Only Cancel or Save close it, so a stray key or click can't discard unsaved masks.
		closeOnEscape: false,
		closeOnClickOutside: false,
		padding: 0,
		children: (
			<ModalHotkeysContext value>
				{/* Takes the initial focus so the name input doesn't pop up the on-screen keyboard. */}
				<FocusTrap.InitialFocus />
				<ResponsiveOcclusionEditor
					modalId={modalId}
					margin={SCREEN_MARGIN}
					target={target}
					onSaved={onSaved}
				/>
			</ModalHotkeysContext>
		),
	});
}
