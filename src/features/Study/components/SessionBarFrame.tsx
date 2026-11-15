import { ReactNode } from "react";
import { Box, Group, Text } from "@mantine/core";
import { SMALL_SCREEN_BREAKPOINT } from "../../../hooks/useIsSmallScreen";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	selectStudyQueue,
	selectStudyShownAt,
	selectStudyTotalCount,
} from "../../../stores/study/studySelectors";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { formatElapsed } from "../utils/formatElapsed";

/** The study bar's layout: progress, the given buttons in the middle, and the element's clock. */
function SessionBarFrame({ children }: { children: ReactNode }) {
	const queue = useAppSelector(selectStudyQueue);
	const totalCount = useAppSelector(selectStudyTotalCount);

	return (
		<Group h="100%" px="sm" py="xs" wrap="nowrap" align="center">
			<Box flex={1}>
				<Text
					size="sm"
					c="dimmed"
					visibleFrom={SMALL_SCREEN_BREAKPOINT}>
					{totalCount - queue.length + 1}/{totalCount}
				</Text>
			</Box>

			{children}

			<Group flex={1} justify="flex-end">
				<ElapsedTime />
			</Group>
		</Group>
	);
}

// Its own component, so only it re-renders on each tick.
function ElapsedTime() {
	const elapsedSeconds = useElapsedSeconds(
		useAppSelector(selectStudyShownAt),
	);
	return (
		<Text size="sm" c="dimmed" visibleFrom={SMALL_SCREEN_BREAKPOINT}>
			{formatElapsed(elapsedSeconds)}
		</Text>
	);
}

export default SessionBarFrame;
