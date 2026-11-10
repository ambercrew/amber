import { Box, Divider, Group, Progress, Stack, Text } from "@mantine/core";
import { IconProps } from "@phosphor-icons/react";
import { ReactElement, useEffect, useMemo, useState } from "react";
import { getReviewedTodayCount } from "../../../api/statistics/api/statisticsApi";
import { commandIcon } from "../../../commands/commandIcon";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectStudyQueue } from "../../../stores/study/studySelectors";
import { openStudySessionSettingsModal } from "../../../stores/app/appReducer";
import { useDueElementsPreview } from "../../Study/hooks/useDueElementsPreview";
import { ElementNodeType } from "../../../types/elements/elementNodeType";
import PanelHeader from "./PanelHeader";
import PriorityQueueList from "./PriorityQueueList";
import StudyScopeBanner from "./StudyScopeBanner";

// Only the types that can actually be due, in the order they're shown.
const COUNTED_TYPES: {
	type: ElementNodeType;
	singular: string;
	plural: string;
}[] = [
	{ type: "learningAsset", singular: "asset", plural: "assets" },
	{ type: "extract", singular: "extract", plural: "extracts" },
	{ type: "card", singular: "card", plural: "cards" },
];

function PriorityQueuePanel() {
	const dispatch = useAppDispatch();
	const queue = useAppSelector(selectStudyQueue);
	const { callApi } = useApi();
	const [reviewedToday, setReviewedToday] = useState<number | null>(null);

	useDueElementsPreview();

	// The queue shrinks as elements are reviewed, so refetch alongside it.
	useEffect(() => {
		let isStale = false;
		void callApi(getReviewedTodayCount).then(count => {
			if (!isStale && count !== undefined) setReviewedToday(count);
		});
		return () => {
			isStale = true;
		};
	}, [callApi, queue]);

	const counts = useMemo(
		() =>
			queue.reduce<Partial<Record<ElementNodeType, number>>>(
				(acc, { elementId }) => {
					acc[elementId.type] = (acc[elementId.type] ?? 0) + 1;
					return acc;
				},
				{},
			),
		[queue],
	);

	const progress =
		reviewedToday === null
			? null
			: Math.round(
					(reviewedToday / (reviewedToday + queue.length)) * 100,
				);

	const breakdown = COUNTED_TYPES.filter(({ type }) => counts[type])
		.map(({ type, singular, plural }) => {
			const count = counts[type] ?? 0;
			return `${count} ${count === 1 ? singular : plural}`;
		})
		.join(" · ");

	const header = (
		<Stack gap={6}>
			<PanelHeader
				title="Study queue"
				actions={[
					{
						icon: commandIcon(
							"open-study-session-settings",
						) as ReactElement<IconProps>,
						label: "Study session settings",
						onClick: () =>
							dispatch(openStudySessionSettingsModal()),
					},
				]}
			/>
			<StudyScopeBanner />
		</Stack>
	);

	if (queue.length === 0) {
		return (
			<Stack p="md" gap="xs">
				{header}
				<Text size="sm" c="dimmed">
					Nothing due right now.
				</Text>
			</Stack>
		);
	}

	return (
		<Stack gap={0} py="xs">
			<Box px="md" py="sm">
				<Stack gap="xs">
					{header}
					<Group justify="space-between" align="baseline">
						<Group gap="xs" align="baseline">
							<Text size="1.75rem" fw={700}>
								{queue.length}
							</Text>
							<Text size="sm" c="dimmed">
								due
							</Text>
						</Group>
						{progress !== null && (
							<Text size="xs" c="dimmed">
								{progress}%
							</Text>
						)}
					</Group>
					<Progress value={progress ?? 0} size="sm" radius="xl" />
					<Text size="sm" c="dimmed">
						{breakdown} due
					</Text>
				</Stack>
			</Box>
			<Divider mb="xs" />
			<PriorityQueueList queue={queue} />
		</Stack>
	);
}

export default PriorityQueuePanel;
