import { useCallback, useEffect } from "react";
import { useLocalStorage } from "@mantine/hooks";
import {
	useZoomCapability,
	ZoomLevel,
	ZoomMode,
} from "@embedpdf/plugin-zoom/react";

export const DEFAULT_PDF_ZOOM_LEVEL: ZoomLevel = ZoomMode.Automatic;

function storageKey(learningAssetId: string) {
	return `pdf-zoom-level-${learningAssetId}`;
}

/** Remembers the learning asset's zoom level in local storage; `restoreZoom` applies it, once the first layout is ready
 * (before it, `requestZoom` silently no-ops against an unmeasured viewport). */
export function usePdfZoomPersistence(
	documentId: string,
	learningAssetId: string,
): { restoreZoom: () => void } {
	const [zoomLevel, setZoomLevel] = useLocalStorage<ZoomLevel>({
		key: storageKey(learningAssetId),
		defaultValue: DEFAULT_PDF_ZOOM_LEVEL,
		getInitialValueInEffect: false,
	});
	const { provides: zoom } = useZoomCapability();

	useEffect(
		() =>
			zoom?.onStateChange(event => {
				if (event.documentId === documentId)
					setZoomLevel(event.state.zoomLevel);
			}),
		[zoom, documentId, setZoomLevel],
	);

	const restoreZoom = useCallback(() => {
		if (zoom && zoomLevel !== DEFAULT_PDF_ZOOM_LEVEL)
			zoom.forDocument(documentId).requestZoom(zoomLevel);
	}, [zoom, documentId, zoomLevel]);

	return { restoreZoom };
}
