import { useEffect, useLayoutEffect, useState } from "react";
import { useViewportElement } from "@embedpdf/plugin-viewport/react";
import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import {
	useElementHeadroom,
	UseElementHeadroomInput,
} from "../../../../hooks/useElementHeadroom";

/** Drives the PDF toolbar's hide-on-scroll-down/show-on-scroll-up behavior
 * off the PDF's own internal viewport scroll (not the outer app scroll,
 * which the PDF viewer opts out of — see PdfDocumentViewport). Must be
 * called from a component rendered inside `<Viewport>`. */
export function usePdfToolbarHeadroom(
	options: Omit<UseElementHeadroomInput, "element"> = {},
) {
	const viewportRef = useViewportElement();
	const [viewportElement, setViewportElement] = useState<HTMLElement | null>(
		null,
	);

	useLayoutEffect(() => {
		setViewportElement(viewportRef?.current ?? null);
	}, [viewportRef]);

	const headroom = useElementHeadroom({
		element: viewportElement,
		...options,
	});
	const { pause } = headroom;

	// Zoom recenters the viewport; don't let that scroll hide the toolbar.
	const { provides: zoom } = useZoomCapability();
	useEffect(() => {
		if (!zoom) return;
		return zoom.onZoomChange(() => pause());
	}, [zoom, pause]);

	return headroom;
}
