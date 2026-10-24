import { PropsWithChildren, useCallback, useMemo, useState } from "react";
import { notifications } from "@mantine/notifications";
import { isNoReadPoint } from "../../../readPoint/readingPosition";
import { useReadingCommand } from "../../../../../commands/readingCommands";
import { flashElement } from "../../../marks/flashElement";
import { READ_POINT_COLOR } from "../../../marks/markLogic";
import { landOnBlock } from "../../core/landOnBlock";
import { useReaderCore } from "../../core/readerCoreContext";
import { ReadPointContext } from "./readPointContext";
import { useReadPoint } from "./useReadPoint";

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
		navigate(
			shown.split,
			landOnBlock(shown.block, block =>
				flashElement(block, READ_POINT_COLOR),
			),
		);
	}, [shown, navigate]);
	useReadingCommand("go-to-read-point", handleGoToRequested);

	const value = useMemo(
		() => ({ displayed: shown, recordExtractReadPoint }),
		[shown, recordExtractReadPoint],
	);
	return <ReadPointContext value={value}>{children}</ReadPointContext>;
}
