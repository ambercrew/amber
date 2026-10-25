import { useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { useReadingCommand } from "../../../commands/readingCommands";
import { ReadingPosition } from "../../../types/elements/readingPosition";

/** Handles "go to read point": jumps to the read point shown, so the shortcut, marker and scrollbar tick agree. */
export function useGoToReadPointCommand(
	displayed: ReadingPosition | null,
	goTo: (readPoint: ReadingPosition) => void,
) {
	const handleGoTo = useCallback(() => {
		if (!displayed) {
			notifications.show({ message: "No read point set" });
			return;
		}
		goTo(displayed);
	}, [displayed, goTo]);
	useReadingCommand("go-to-read-point", handleGoTo);
}
