import {
	PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { notifications } from "@mantine/notifications";
import { isNoReadPoint } from "../../../readPoint/readingPosition";
import { useReadingCommand } from "../../../../../commands/readingCommands";
import { flashElement } from "../../../marks/flashElement";
import { READ_POINT_COLOR } from "../../../marks/markLogic";
import { landOnBlock } from "../../core/landOnBlock";
import { useReaderCore } from "../../core/readerCoreContext";
import { ReadPointContext } from "./readPointContext";
import { useReadPoint } from "./useReadPoint";

const landOnReadPoint = (block: number) =>
	landOnBlock(block, landed => flashElement(landed, READ_POINT_COLOR));

/** Saves the read point as the reader goes, and handles the set/clear/go-to read point commands. */
export default function ReadPointProvider({ children }: PropsWithChildren) {
	const {
		learningAssetId,
		initialReadPoint: initial,
		splits,
		primarySeq,
		getContentRoot,
		restoredRef,
		anchors,
		navigate,
	} = useReaderCore();
	const [displayed, setDisplayed] = useState(initial);

	const { recordExtractReadPoint } = useReadPoint({
		learningAssetId,
		primarySeq,
		initial,
		getContentRoot,
		lastSplitSeq: splits[splits.length - 1]?.seq,
		restoredRef,
		anchors,
		onReadPointChange: setDisplayed,
	});

	const shown = isNoReadPoint(displayed) ? null : displayed;
	// Goes where the marker is, so the shortcut, marker and scrollbar tick agree.
	const handleGoToRequested = useCallback(() => {
		if (!shown) {
			notifications.show({ message: "No read point set" });
			return;
		}
		navigate(shown.split, landOnReadPoint(shown.block));
	}, [shown, navigate]);
	useReadingCommand("go-to-read-point", handleGoToRequested);

	// Replaces the core's plain restore on open, so the read point flashes as it does on "go to".
	const restoreRequestedRef = useRef(false);
	useEffect(() => {
		if (restoreRequestedRef.current || isNoReadPoint(initial)) return;
		restoreRequestedRef.current = true;
		navigate(initial.split, landOnReadPoint(initial.block));
	}, [initial, navigate]);

	const value = useMemo(
		() => ({ displayed: shown, recordExtractReadPoint }),
		[shown, recordExtractReadPoint],
	);
	return <ReadPointContext value={value}>{children}</ReadPointContext>;
}
