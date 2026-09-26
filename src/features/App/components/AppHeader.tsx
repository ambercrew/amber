import { ActionIcon, Box, Group, Text } from "@mantine/core";
import { CommandIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { spotlight } from "@mantine/spotlight";
import { ReactNode } from "react";
import { useLocation } from "react-router";
import ElementNodeIcon from "../../../components/ElementNodeIcon/ElementNodeIcon";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { SPOTLIGHT_SHORTCUT } from "../../../commands/commands";
import StudyModeToggle from "../../Study/components/StudyModeToggle";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { BrowserIcon, HomeIcon } from "../../../config/icons";
import { paths } from "../../../paths";

const ICON_SIZE = 18;

interface AppHeaderProps {
	onToggleSidebar: () => void;
	onToggleAside: () => void;
}

function AppHeader({ onToggleSidebar, onToggleAside }: AppHeaderProps) {
	const currentElement = useAppSelector(selectCurrentElement);
	const location = useLocation();
	const storedMeta = currentElement?.data.meta ?? null;

	// The route wins over the loaded element, which outlives navigating away
	// from it to Home or the Browser.
	let icon: ReactNode = null;
	let name: string | null = null;

	if (location.pathname === paths.browser()) {
		icon = <BrowserIcon size={ICON_SIZE} />;
		name = "Browser";
	} else if (location.pathname === paths.root()) {
		icon = <HomeIcon size={ICON_SIZE} />;
		name = "Home";
	} else if (storedMeta) {
		icon = (
			<ElementNodeIcon
				type={storedMeta.elementId.type}
				size={ICON_SIZE}
			/>
		);
		name = storedMeta.name;
	}

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

				{name && (
					<Group gap={6} align="center" wrap="nowrap" miw={0} px="xs">
						<Box style={{ flexShrink: 0, display: "flex" }}>
							{icon}
						</Box>
						<Text truncate="end">{name}</Text>
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
