import { ActionIcon, Box, Group, Text } from "@mantine/core";
import { CommandIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { spotlight } from "@mantine/spotlight";
import ElementNodeIcon from "./ElementNodeIcon";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { SPOTLIGHT_SHORTCUT } from "../../../commands/commands";
import StudyModeToggle from "../../Study/components/StudyModeToggle";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

interface AppHeaderProps {
	onToggleSidebar: () => void;
	onToggleAside: () => void;
}

function AppHeader({ onToggleSidebar, onToggleAside }: AppHeaderProps) {
	const currentElement = useAppSelector(selectCurrentElement);
	const storedMeta = currentElement?.data.meta ?? null;

	return (
		<Group
			h="100%"
			p="xs"
			gap="sm"
			align="center"
			wrap="nowrap"
			justify="space-between">
			<Group gap={0} align="center" wrap="nowrap" miw={0}>
				<AppTooltip label="Toggle left sidebar">
					<ActionIcon
						variant="subtle"
						size="lg"
						aria-label="Toggle left sidebar"
						onClick={onToggleSidebar}>
						<SidebarSimpleIcon size={18} />
					</ActionIcon>
				</AppTooltip>

				{storedMeta && (
					<Group gap={6} align="center" wrap="nowrap" miw={0} px="xs">
						<Box style={{ flexShrink: 0, display: "flex" }}>
							<ElementNodeIcon
								type={storedMeta.elementId.type}
								size={18}
							/>
						</Box>
						<Text truncate="end">{storedMeta.name}</Text>
					</Group>
				)}
			</Group>

			<Group gap={6} align="center" wrap="nowrap">
				<StudyModeToggle />
				<AppTooltip
					label="Open command palette"
					shortcut={SPOTLIGHT_SHORTCUT}>
					<ActionIcon
						variant="subtle"
						size="lg"
						aria-label="Open command palette"
						onClick={() => spotlight.open()}>
						<CommandIcon size={18} />
					</ActionIcon>
				</AppTooltip>
				<AppTooltip label="Toggle right sidebar">
					<ActionIcon
						variant="subtle"
						size="lg"
						aria-label="Toggle right sidebar"
						onClick={onToggleAside}>
						<SidebarSimpleIcon
							size={18}
							style={{ transform: "scaleX(-1)" }}
						/>
					</ActionIcon>
				</AppTooltip>
			</Group>
		</Group>
	);
}

export default AppHeader;
