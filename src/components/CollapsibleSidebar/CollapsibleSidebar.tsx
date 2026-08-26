import { ReactNode } from "react";
import {
	AppShell,
	Tabs,
	Group,
	ActionIcon,
	ScrollArea,
	Box,
} from "@mantine/core";
import { XIcon } from "@phosphor-icons/react";
import { SMALL_SCREEN_BREAKPOINT } from "../../hooks/useIsSmallScreen";
import { useLocalStorage } from "@mantine/hooks";
import AppTooltip from "../AppTooltip/AppTooltip";

export interface SidebarTab {
	value: string;
	title: string;
	icon: ReactNode;
	panel: ReactNode;
	/**
	 * Whether the sidebar should scroll the panel's content for it.
	 * Set to false when the panel manages its own height and scrolling.
	 * Defaults to true.
	 */
	scrollable?: boolean;
	/**
	 * Whether the sidebar should apply the common panel padding
	 * around the panel's content. Set to false when the panel manages its
	 * own padding. Defaults to true.
	 */
	padded?: boolean;
}

interface CollapsibleSidebarProps {
	tabs: SidebarTab[];
	defaultValue: string;
	onCollapse: () => void;
	/** Side the collapse button is anchored to. Defaults to "right". */
	collapsePosition?: "left" | "right";
	/** Used to remember which tab were open last time the app was open. */
	localStorageKey: string;
}

function CollapsibleSidebar({
	tabs,
	defaultValue,
	onCollapse,
	collapsePosition = "right",
	localStorageKey,
}: CollapsibleSidebarProps) {
	const [value, setValue] = useLocalStorage({
		defaultValue,
		key: `${localStorageKey}.open-tab`,
	});
	const activeValue = tabs.some(tab => tab.value === value)
		? value
		: (tabs[0]?.value ?? "");

	return (
		<AppShell.Section
			grow
			style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
			<Tabs
				value={activeValue}
				onChange={v => v && setValue(v)}
				variant="pills"
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
				}}>
				<Group
					justify="center"
					py="sm"
					style={{ position: "relative" }}>
					<Tabs.List>
						{tabs.map(tab => (
							<AppTooltip
								key={tab.value}
								label={tab.title}
								position="bottom">
								<Tabs.Tab
									value={tab.value}
									aria-label={tab.title}>
									{tab.icon}
								</Tabs.Tab>
							</AppTooltip>
						))}
					</Tabs.List>
					<ActionIcon
						variant="subtle"
						onClick={onCollapse}
						hiddenFrom={SMALL_SCREEN_BREAKPOINT}
						mx="md"
						style={{
							position: "absolute",
							[collapsePosition]: 0,
						}}>
						<XIcon size={18} />
					</ActionIcon>
				</Group>

				{tabs.map(tab => {
					const content = (
						<Box
							py={tab.padded === false ? undefined : "sm"}
							px={tab.padded === false ? undefined : "sm"}
							h="100%">
							{tab.panel}
						</Box>
					);

					return (
						<Tabs.Panel
							key={tab.value}
							value={tab.value}
							style={{
								flex: 1,
								minHeight: 0,
								display: "flex",
								flexDirection: "column",
							}}>
							{tab.scrollable === false ? (
								content
							) : (
								<ScrollArea
									style={{ flex: 1 }}
									styles={{
										viewport: {
											overscrollBehavior: "contain",
										},
									}}>
									{content}
								</ScrollArea>
							)}
						</Tabs.Panel>
					);
				})}
			</Tabs>
		</AppShell.Section>
	);
}

export default CollapsibleSidebar;
