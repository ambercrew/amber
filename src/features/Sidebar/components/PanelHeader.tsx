import { ActionIcon, Group, Menu, Text } from "@mantine/core";
import { IconProps } from "@phosphor-icons/react";
import { cloneElement, ReactElement, ReactNode } from "react";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

const ICON_SIZE = 18;

export interface PanelHeaderAction {
	icon: ReactElement<IconProps>;
	label: string;
	onClick?: () => void;
	disabled?: boolean;
	/** Dropdown content (e.g. <Menu.Dropdown>...</Menu.Dropdown>). When set,
	 * the action opens a menu instead of calling onClick. */
	menu?: ReactNode;
}

interface PanelHeaderProps {
	title: string;
	actions?: PanelHeaderAction[];
}

function PanelHeader({ title, actions = [] }: PanelHeaderProps) {
	return (
		<Group justify="space-between" align="center">
			<Text size="sm" fw={600} c="dimmed" tt="uppercase">
				{title}
			</Text>
			<Group gap="xs">
				{actions.map(action => {
					const button = (
						<ActionIcon
							variant="subtle"
							size="md"
							aria-label={action.label}
							disabled={action.disabled}
							onClick={action.onClick}>
							{cloneElement(action.icon, { size: ICON_SIZE })}
						</ActionIcon>
					);

					if (action.menu) {
						return (
							<Menu key={action.label} position="bottom-end">
								<AppTooltip label={action.label}>
									<Menu.Target>{button}</Menu.Target>
								</AppTooltip>
								{action.menu}
							</Menu>
						);
					}

					return (
						<AppTooltip key={action.label} label={action.label}>
							{button}
						</AppTooltip>
					);
				})}
			</Group>
		</Group>
	);
}

export default PanelHeader;
