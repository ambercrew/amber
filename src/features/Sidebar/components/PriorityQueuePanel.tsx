import { Badge, Box, Group, NavLink, Stack, Text } from "@mantine/core";
import { IconProps } from "@phosphor-icons/react";
import { ReactElement, useMemo } from "react";
import { useNavigate } from "react-router";
import { commandIcon } from "../../../commands/commandIcon";
import { useElementParams } from "../../../hooks/useElementParams";
import { paths } from "../../../paths";
import ElementNodeIcon from "../../App/components/ElementNodeIcon";
import { StudySessionLocationState } from "../../../types/study/studySessionLocationState";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectStudyQueue } from "../../../stores/study/studySelectors";
import { openStudySessionSettingsModal } from "../../../stores/app/appReducer";
import { useDueElementsPreview } from "../../Study/hooks/useDueElementsPreview";
import { ElementNodeType } from "../../../types/elements/elementNodeType";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import PanelHeader from "./PanelHeader";

const ICON_SIZE = 18;
const COUNT_ICON_SIZE = 16;

// Only the types that can actually be due, in the order they're shown.
const COUNTED_TYPES: { type: ElementNodeType; label: string }[] = [
	{ type: "learningAsset", label: "Learning assets" },
	{ type: "extract", label: "Extracts" },
	{ type: "card", label: "Cards" },
];

function PriorityQueuePanel() {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const selected = useElementParams();
	const queue = useAppSelector(selectStudyQueue);

	useDueElementsPreview();

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

	const header = (
		<PanelHeader
			title="Study queue"
			actions={[
				{
					icon: commandIcon(
						"open-study-session-settings",
					) as ReactElement<IconProps>,
					label: "Study session settings",
					onClick: () => dispatch(openStudySessionSettingsModal()),
				},
			]}
		/>
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
					<Group gap="xs" align="baseline">
						<Text size="1.75rem" fw={700}>
							{queue.length}
						</Text>
						<Text size="sm" c="dimmed">
							due
						</Text>
					</Group>
					<Group gap={4}>
						{COUNTED_TYPES.map(({ type, label }) => (
							<AppTooltip key={type} label={label} touch>
								<Badge
									size="lg"
									radius="xl"
									variant="default"
									fw={700}
									leftSection={
										<Box display="flex">
											<ElementNodeIcon
												type={type}
												size={COUNT_ICON_SIZE}
											/>
										</Box>
									}>
									{counts[type] ?? 0}
								</Badge>
							</AppTooltip>
						))}
					</Group>
				</Stack>
			</Box>
			{queue.map(({ elementId, title }) => {
				const isSelected =
					selected?.type === elementId.type &&
					selected?.id === elementId.id;

				return (
					<NavLink
						key={`${elementId.type}:${elementId.id}`}
						label={
							<Text size="sm" lineClamp={2}>
								{title}
							</Text>
						}
						active={isSelected}
						styles={{
							root: { alignItems: "flex-start" },
							section: { marginTop: 2 },
							label: {
								whiteSpace: "normal",
								overflow: "visible",
							},
						}}
						leftSection={
							<ElementNodeIcon
								type={elementId.type}
								size={ICON_SIZE}
							/>
						}
						onClick={() => {
							const state: StudySessionLocationState = {
								studySessionNav: true,
							};
							void navigate(
								paths.element(elementId.type, elementId.id),
								{ state },
							);
						}}
					/>
				);
			})}
		</Stack>
	);
}

export default PriorityQueuePanel;
