import { useCallback, useEffect, useRef, useState } from "react";
import { updateReadPoint } from "../../../api/elements/api/elementsApi";
import useApi from "../../../hooks/useApi";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { isSamePosition } from "./readingPosition";
import useAutoSave from "../hooks/useAutoSave";
import { canPlaceReadPoint } from "./readPointPrecedence";
import { ReadPointSource } from "../../../types/elements/readPointSource";

interface Props {
	learningAssetId: string;
	/** Read point saved when the learning asset was opened. */
	initial: ReadingPosition;
	/** Precedence to open with, as a study session's Return keeps the last visit's; else automatic tracking. */
	resumeSource?: ReadPointSource;
	/** Called on unmount with the precedence the read point was left at. */
	onLeave?: (source: ReadPointSource) => void;
}

interface ReturnValue {
	/** Places the read point if `source` may override the last placement, saving it debounced. Returns whether it was placed. */
	place: (readPoint: ReadingPosition, source: ReadPointSource) => boolean;
	/** Whether a placement from `source` would currently be accepted. */
	accepts: (source: ReadPointSource) => boolean;
	/** Forgets this opening's placements, back to the precedence it opened with. */
	reset: () => void;
}

/** Read point precedence and saving, shared by the text and PDF views; saves flush on unmount, app close and before a sync. */
export function useReadPointPlacement({
	learningAssetId,
	initial,
	resumeSource = "automatic",
	onLeave,
}: Props): ReturnValue {
	const [openingSource] = useState(resumeSource);
	const sourceRef = useRef(openingSource);
	const onLeaveRef = useRef(onLeave);
	useEffect(() => {
		onLeaveRef.current = onLeave;
	}, [onLeave]);
	// Declared before the PDF view's own reset on unmount, so it reports the visit's precedence.
	useEffect(() => () => onLeaveRef.current?.(sourceRef.current), []);
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
		sourceRef.current = openingSource;
	}, [openingSource]);

	return { place, accepts, reset };
}
