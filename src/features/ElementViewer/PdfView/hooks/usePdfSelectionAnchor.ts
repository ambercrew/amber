import { useEffect, useState } from "react";
import { GlyphPointer } from "@embedpdf/plugin-selection";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";

/**
 * The glyph the latest text selection was started from. Embedpdf only reports it as the drag
 * begins, before the floating menu mounts, so it's tracked from the always-mounted document.
 */
export function usePdfSelectionAnchor(
	documentId: string | null,
): GlyphPointer | null {
	const { provides: selection } = useSelectionCapability();
	const [anchor, setAnchor] = useState<GlyphPointer | null>(null);

	useEffect(() => {
		if (!selection || !documentId) return;
		return selection
			.forDocument(documentId)
			.onBeginSelection(({ page, index }) => setAnchor({ page, index }));
	}, [selection, documentId]);

	return anchor;
}
