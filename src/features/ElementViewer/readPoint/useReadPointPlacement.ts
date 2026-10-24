import { useCallback, useRef } from "react";
import { updateReadPoint } from "../../../api/elements/api/elementsApi";
import useApi from "../../../hooks/useApi";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { isSamePosition } from "./readingPosition";
import useAutoSave from "../hooks/useAutoSave";
import { canPlaceReadPoint, ReadPointSource } from "./readPointPrecedence";

interface Props {
	learningAssetId: string;
	/** Read point saved when the learning asset was opened. */
	initial: ReadingPosition;
}

interface ReturnValue {
	/** Places the read point if `source` may override the last placement, saving it debounced. Returns whether it was placed. */
	place: (readPoint: ReadingPosition, source: ReadPointSource) => boolean;
	/** Whether a placement from `source` would currently be accepted. */
	accepts: (source: ReadPointSource) => boolean;
	/** Forgets earlier placements, as on a fresh open. */
	reset: () => void;
}

/** Read point precedence and saving, shared by the text and PDF views; saves flush on unmount, app close and before a sync. */
export function useReadPointPlacement({
	learningAssetId,
	initial,
}: Props): ReturnValue {
	const sourceRef = useRef<ReadPointSource>("automatic");
	const lastSavedRef = useRef(initial);

	const { callApi } = useApi();
	const handleSave = useCallback(
		async (readPoint: ReadingPosition) => {
			if (isSamePosition(readPoint, lastSavedRef.current)) return;
			lastSavedRef.current = readPoint;
			await updateReadPoint({ learningAssetId, readPoint });
		},
		[learningAssetId],
	);
	const { onContentUpdate } = useAutoSave({ onSave: handleSave, callApi });

	const accepts = useCallback(
		(source: ReadPointSource) =>
			canPlaceReadPoint(source, sourceRef.current),
		[],
	);
	const place = useCallback(
		(readPoint: ReadingPosition, source: ReadPointSource) => {
			if (!canPlaceReadPoint(source, sourceRef.current)) return false;
			sourceRef.current = source;
			// Captured now, not read at flush time: views may tear down before the flush runs.
			onContentUpdate(() => readPoint);
			return true;
		},
		[onContentUpdate],
	);
	const reset = useCallback(() => {
		sourceRef.current = "automatic";
	}, []);

	return { place, accepts, reset };
}
