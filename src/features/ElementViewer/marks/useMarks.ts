import { useCallback, useEffect, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import {
	clearLearningAssetMark,
	getLearningAssetMarks,
	setLearningAssetMark,
} from "../../../api/elements/api/elementsApi";
import useApi from "../../../hooks/useApi";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../stores/sync/managers/syncEventManager";
import {
	LearningAssetMark,
	MarkSlot,
} from "../../../types/elements/learningAssetMark";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { useReadingCommand } from "../../../commands/readingCommands";
import { findMark, withMark } from "./markLogic";
import { showMarkUndoNotification } from "./markUndoNotification";

interface Props {
	learningAssetId: string;
	/** Where a mark set right now should land, or `null` when there's nothing to anchor to yet. */
	resolveSetAnchor: () => ReadingPosition | null;
	/** Scrolls to a set mark's anchor. */
	goTo: (anchor: ReadingPosition, slot: MarkSlot) => void;
}

/** Loads a learning asset's marks and handles the set/go-to mark commands, the only things that move them.
 * Each change is written straight away rather than debounced. */
export function useMarks({
	learningAssetId,
	resolveSetAnchor,
	goTo,
}: Props): LearningAssetMark[] {
	const [marks, setMarks] = useState<LearningAssetMark[]>([]);
	const marksRef = useRef(marks);
	useEffect(() => {
		marksRef.current = marks;
	}, [marks]);

	const { callApi, errorMessage, clearErrorMessage } = useApi();
	useEffect(() => {
		if (!errorMessage) return;
		notifications.show({ message: errorMessage, color: "red" });
		clearErrorMessage();
	}, [errorMessage, clearErrorMessage]);

	// Bumped by every load and write, so a load that a later one overtook drops its stale result.
	const versionRef = useRef(0);
	const loadsInFlightRef = useRef(0);
	const load = useCallback(async () => {
		const version = ++versionRef.current;
		loadsInFlightRef.current++;
		try {
			await callApi(async () => {
				const loaded = await getLearningAssetMarks(learningAssetId);
				if (version === versionRef.current) setMarks(loaded);
			});
		} finally {
			loadsInFlightRef.current--;
		}
	}, [callApi, learningAssetId]);

	useEffect(() => {
		void load();
	}, [load]);

	// Another device may have placed or moved a mark.
	useEffect(() => {
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PostSyncComplete,
			load,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PostSyncComplete,
				load,
			);
	}, [load]);

	const writeMark = useCallback(
		async (slot: MarkSlot, anchor: ReadingPosition | null) => {
			const written = await callApi(async () => {
				if (anchor)
					await setLearningAssetMark({
						learningAssetId,
						slot,
						anchor,
					});
				else await clearLearningAssetMark({ learningAssetId, slot });
				return true;
			});
			if (!written) return false;
			versionRef.current++;
			setMarks(current => withMark(current, slot, anchor));
			// A load overtaken by this write still carries changes from elsewhere, so fetch them again.
			if (loadsInFlightRef.current > 0) void load();
			return true;
		},
		[callApi, learningAssetId, load],
	);

	const setMark = useCallback(
		async (slot: MarkSlot) => {
			const anchor = resolveSetAnchor();
			if (!anchor) {
				notifications.show({
					message: `Couldn't place mark ${slot} here yet, try again once the text has loaded`,
				});
				return;
			}
			const previous = findMark(marksRef.current, slot)?.anchor ?? null;
			if (!(await writeMark(slot, anchor))) return;
			showMarkUndoNotification(slot, previous !== null, () => {
				void writeMark(slot, previous);
			});
		},
		[resolveSetAnchor, writeMark],
	);
	const handleSetRequested = useCallback(
		({ slot }: { slot: MarkSlot }) => void setMark(slot),
		[setMark],
	);

	const handleGotoRequested = useCallback(
		({ slot }: { slot: MarkSlot }) => {
			const mark = findMark(marksRef.current, slot);
			if (!mark) {
				notifications.show({ message: `Mark ${slot} isn't set` });
				return;
			}
			goTo(mark.anchor, slot);
		},
		[goTo],
	);

	useReadingCommand("set-mark", handleSetRequested);
	useReadingCommand("go-to-mark", handleGotoRequested);

	return marks;
}
