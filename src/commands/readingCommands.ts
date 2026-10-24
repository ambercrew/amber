import { useEffect } from "react";
import { MarkSlot } from "../types/elements/learningAssetMark";

/** Commands carried out by whichever learning asset view (text or PDF) is open. */
export type ReadingCommand =
	| { type: "set-read-point" }
	| { type: "clear-read-point" }
	| { type: "go-to-read-point" }
	| { type: "set-mark"; slot: MarkSlot }
	| { type: "go-to-mark"; slot: MarkSlot };

type ReadingCommandType = ReadingCommand["type"];
type ReadingCommandOf<T extends ReadingCommandType> = Extract<
	ReadingCommand,
	{ type: T }
>;
type Handler = (command: ReadingCommand) => void;

const handlers = new Map<ReadingCommandType, Set<Handler>>();

/** Sends `command` to the open learning asset view; does nothing when none is open. */
export function runReadingCommand(command: ReadingCommand): void {
	handlers.get(command.type)?.forEach(handler => handler(command));
}

/** Handles `type` reading commands while the calling component is mounted. */
export function useReadingCommand<T extends ReadingCommandType>(
	type: T,
	handler: (command: ReadingCommandOf<T>) => void,
): void {
	useEffect(() => {
		const registered = handler as Handler;
		const forType = handlers.get(type) ?? new Set();
		handlers.set(type, forType.add(registered));
		return () => {
			forType.delete(registered);
		};
	}, [type, handler]);
}
