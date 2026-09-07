import { useEffect } from "react";
import { useLocalStorage } from "@mantine/hooks";
import {
	useZoomCapability,
	ZoomLevel,
	ZoomMode,
} from "@embedpdf/plugin-zoom/react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";

export const DEFAULT_PDF_ZOOM_LEVEL: ZoomLevel = ZoomMode.Automatic;

function storageKey(learningAssetId: string) {
	return `pdf-zoom-level-${learningAssetId}`;
}

/**
 * Restores this learning asset's last-used PDF zoom level once its document
 * has loaded, and persists it to local storage whenever it changes after
 * that — so reopening the learning asset restores the same zoom.
 *
 * The restore is applied explicitly via `requestZoom`, on the scroll
 * plugin's `onLayoutReady` (mirrors `usePdfReadPoint`'s restore), rather
 * than through the zoom plugin's `defaultZoomLevel` config or the `isLoaded`
 * flag alone: the zoom plugin only self-applies its default for the
 * "automatic"/"fit" modes on load, and `requestZoom` itself silently no-ops
 * against zero-sized viewport metrics if called before the initial layout
 * has actually been measured.
 */
export function usePdfZoomPersistence(
	documentId: string | null,
	learningAssetId: string,
) {
	const [zoomLevel, setZoomLevel] = useLocalStorage<ZoomLevel>({
		key: storageKey(learningAssetId),
		defaultValue: DEFAULT_PDF_ZOOM_LEVEL,
		getInitialValueInEffect: false,
	});
	const { provides: zoom } = useZoomCapability();
	const { provides: scrollCapability } = useScrollCapability();

	useEffect(() => {
		if (!zoom || !scrollCapability || !documentId) return;

		const unsubscribeLayoutReady = scrollCapability.onLayoutReady(event => {
			if (event.documentId !== documentId || !event.isInitial) return;
			if (zoomLevel !== DEFAULT_PDF_ZOOM_LEVEL) {
				zoom.forDocument(documentId).requestZoom(zoomLevel);
			}
		});
		const unsubscribeStateChange = zoom.onStateChange(event => {
			if (event.documentId === documentId)
				setZoomLevel(event.state.zoomLevel);
		});

		return () => {
			unsubscribeLayoutReady();
			unsubscribeStateChange();
		};
		// `zoomLevel` is only read for the one-time restore above.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [zoom, scrollCapability, documentId, setZoomLevel]);
}
