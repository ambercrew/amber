import { ComponentPropsWithoutRef, forwardRef } from "react";
import {
	ActionIcon,
	Button,
	Divider,
	Group,
	MantineColor,
	Paper,
	PaperProps,
} from "@mantine/core";
import AppTooltip from "../AppTooltip/AppTooltip";

export interface FloatingMenuBarButton {
	divider?: false;
	name: string;
	title: string;
	label?: string;
	showLabel?: boolean;
	color?: MantineColor;
	Icon: React.ComponentType<{ size?: number }>;
	isActive?: boolean;
	isVisible?: boolean;
	onClick?: () => void;
}

export interface FloatingMenuBarDivider {
	divider: true;
	name: string;
}

export type FloatingMenuBarItem =
	FloatingMenuBarButton | FloatingMenuBarDivider;

function isFloatingMenuBarDivider(
	item: FloatingMenuBarItem,
): item is FloatingMenuBarDivider {
	return !!item.divider;
}

type Props = PaperProps &
	Omit<ComponentPropsWithoutRef<"div">, keyof PaperProps> & {
		items: FloatingMenuBarItem[];
	};

/**
 * Presentational button bar for a floating text-selection menu: a `Paper`
 * containing a row of `Button`/`ActionIcon` items (with dividers collapsed
 * when they'd otherwise dangle). Positioning is the caller's responsibility —
 * pass it through `style`/`className`/other `Paper` props.
 */
const FloatingMenuBar = forwardRef<HTMLDivElement, Props>(
	({ items, ...paperProps }, ref) => {
		// Only render a divider when it has a visible button on both sides,
		// otherwise it would dangle at the start/end or next to another divider.
		const candidates = items.filter(
			item => isFloatingMenuBarDivider(item) || item.isVisible !== false,
		);
		const visibleItems = candidates.filter((item, index) => {
			if (!isFloatingMenuBarDivider(item)) return true;
			const prev = candidates[index - 1];
			const next = candidates[index + 1];
			return (
				!!prev &&
				!!next &&
				!isFloatingMenuBarDivider(prev) &&
				!isFloatingMenuBarDivider(next)
			);
		});

		return (
			<Paper ref={ref} withBorder shadow="md" p={4} {...paperProps}>
				<Group gap={2} wrap="nowrap">
					{visibleItems.map(item =>
						isFloatingMenuBarDivider(item) ? (
							<Divider
								key={item.name}
								mx={4}
								orientation="vertical"
							/>
						) : item.showLabel ? (
							<AppTooltip key={item.name} label={item.title}>
								<Button
									variant={
										item.isActive ? "filled" : "subtle"
									}
									color={item.color}
									size="sm"
									px="xs"
									leftSection={<item.Icon size={22} />}
									aria-label={item.title}
									onMouseDown={(e: React.MouseEvent) =>
										e.preventDefault()
									}
									onClick={item.onClick}>
									{item.label ?? item.title}
								</Button>
							</AppTooltip>
						) : (
							<AppTooltip key={item.name} label={item.title}>
								<ActionIcon
									variant={
										item.isActive ? "filled" : "subtle"
									}
									color={item.color}
									size="lg"
									aria-label={item.title}
									onMouseDown={(e: React.MouseEvent) =>
										e.preventDefault()
									}
									onClick={item.onClick}>
									<item.Icon size={22} />
								</ActionIcon>
							</AppTooltip>
						),
					)}
				</Group>
			</Paper>
		);
	},
);

FloatingMenuBar.displayName = "FloatingMenuBar";

export default FloatingMenuBar;
