import { useEffect, useLayoutEffect, useState } from "react";
import { useViewportElement } from "@embedpdf/plugin-viewport/react";
import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import {
	useElementHeadroom,
	UseElementHeadroomInput,
} from "../../../../hooks/useElementHeadroom";

/** Hide-on-scroll for the PDF's toolbar and the header, driven by the PDF viewport's own scroll. Call inside `<Viewport>`. */
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

	return { ...headroom, viewportElement };
}
