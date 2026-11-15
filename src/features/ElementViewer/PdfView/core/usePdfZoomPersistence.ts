import { useCallback, useRef } from "react";
import { useLocalStorage } from "@mantine/hooks";
import {
	StageCapability,
	useStageEvent,
	ZoomMode,
	ZoomModeValue,
} from "@embedpdf/react/stage";

/** A fixed level (1 = 100%) or a fit mode. */
export type PdfZoomLevel = number | ZoomModeValue;

export const DEFAULT_PDF_ZOOM_LEVEL: PdfZoomLevel = ZoomMode.Automatic;

// Versioned: embedpdf 3's 100% is a page's printed size, larger than 2's, so its stored levels would open too big.
function storageKey(learningAssetId: string) {
	return `pdf-zoom-level-v3-${learningAssetId}`;
}

/** Remembers the learning asset's zoom level in local storage; `restoreZoom` applies it once the first layout is ready. */
export function usePdfZoomPersistence(
	stage: StageCapability,
	learningAssetId: string,
): { restoreZoom: () => void } {
	const [zoomLevel, setZoomLevel] = useLocalStorage<PdfZoomLevel>({
		key: storageKey(learningAssetId),
		defaultValue: DEFAULT_PDF_ZOOM_LEVEL,
		getInitialValueInEffect: false,
	});

	// The first layout's own fit isn't the reader's choice, so nothing is saved until the restore ran.
	const restoredRef = useRef(false);
	useStageEvent(
		current => current.onZoomChanged,
		({ level, mode }) => {
			if (restoredRef.current)
				setZoomLevel(mode === "custom" ? level : mode);
		},
	);

	const restoreZoom = useCallback(() => {
		if (zoomLevel !== DEFAULT_PDF_ZOOM_LEVEL)
			stage.zoomTo(
				typeof zoomLevel === "number" ? zoomLevel : { mode: zoomLevel },
			);
		restoredRef.current = true;
	}, [stage, zoomLevel]);

	return { restoreZoom };
}
