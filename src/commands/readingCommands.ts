import { addListener, createAction } from "@reduxjs/toolkit";
import { useEffect, useEffectEvent } from "react";
import useAppDispatch from "../hooks/useAppDispatch";
import { MarkSlot } from "../types/elements/learningAssetMark";

/** Commands carried out by whichever learning asset view (text or PDF) is open. */
export type ReadingCommand =
	| { type: "set-read-point" }
	| { type: "clear-read-point" }
	| { type: "go-to-read-point" }
	| { type: "set-mark"; slot: MarkSlot }
	| { type: "go-to-mark"; slot: MarkSlot }
	| { type: "go-to-table-of-contents-entry"; entryId: string };

type ReadingCommandType = ReadingCommand["type"];
type ReadingCommandOf<T extends ReadingCommandType> = Extract<
	ReadingCommand,
	{ type: T }
>;

/** Sends `command` to the open learning asset view, when dispatched; does nothing when none is open. */
export const runReadingCommand = createAction<ReadingCommand>(
	"readingCommands/run",
);

/** Handles `type` reading commands sent while the calling component is mounted. */
export function useReadingCommand<T extends ReadingCommandType>(
	type: T,
	handler: (command: ReadingCommandOf<T>) => void,
): void {
	const dispatch = useAppDispatch();
	const handle = useEffectEvent(handler);

	useEffect(
		() =>
			dispatch(
				addListener({
					actionCreator: runReadingCommand,
					effect: ({ payload }) => {
						if (payload.type === type)
							handle(payload as ReadingCommandOf<T>);
					},
				}),
			),
		[dispatch, type],
	);
}
