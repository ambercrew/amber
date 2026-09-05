import { useMemo } from "react";
import { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react";
import FloatingMenuBar, {
	FloatingMenuBarItem,
} from "../../../../components/FloatingMenuBar/FloatingMenuBar";
import useAppSelector from "../../../../hooks/useAppSelector";
import { selectSettings } from "../../../../stores/settings/settingsSelector";
import {
	ADD_AI_CONTEXT_BUTTON,
	CLOZE_BUTTON,
	EXTRACT_BUTTON,
	OPEN_HIGHLIGHT_BUTTON,
	REMOVE_HIGHLIGHT_BUTTON,
} from "../../highlightFloatingMenuButtons";

// TODO: wire up onClick/isActive/isVisible handlers to actually create an
// extract/cloze, add to AI context, and act on the highlight under the
// current PDF text selection.
export default function PdfFloatingMenu({
	menuWrapperProps,
	placement,
}: SelectionSelectionMenuProps) {
	const aiEnabled = useAppSelector(selectSettings)?.enableAi ?? false;

	const items = useMemo<FloatingMenuBarItem[]>(
		() => [
			EXTRACT_BUTTON,
			CLOZE_BUTTON,
			...(aiEnabled
				? [
						{
							name: "add-ai-context-divider",
							divider: true as const,
						},
						ADD_AI_CONTEXT_BUTTON,
					]
				: []),
			{ name: "create-highlight-divider", divider: true },
			OPEN_HIGHLIGHT_BUTTON,
			REMOVE_HIGHLIGHT_BUTTON,
		],
		[aiEnabled],
	);

	return (
		<div {...menuWrapperProps}>
			<FloatingMenuBar
				items={items}
				style={{
					position: "absolute",
					left: "50%",
					transform: "translateX(-50%)",
					pointerEvents: "auto",
					zIndex: 100,
					width: "max-content",
					...(placement.suggestTop
						? { bottom: "100%", marginBottom: 8 }
						: { top: "100%", marginTop: 8 }),
				}}
			/>
		</div>
	);
}
