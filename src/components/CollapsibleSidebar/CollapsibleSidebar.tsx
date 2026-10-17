import { ReactNode, useEffect, useState } from "react";
import {
	AppShell,
	Tabs,
	Group,
	ActionIcon,
	ScrollArea,
	Box,
	FloatingIndicator,
	useMantineTheme,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { XIcon } from "@phosphor-icons/react";
import { SMALL_SCREEN_BREAKPOINT } from "../../hooks/useIsSmallScreen";
import { useSidebarTab } from "./useSidebarTab";
import AppTooltip from "../AppTooltip/AppTooltip";

const PANEL_FADE_MS = 150;

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
	const [value, setValue] = useSidebarTab(localStorageKey, defaultValue);
	const activeValue = tabs.some(tab => tab.value === value)
		? value
		: (tabs[0]?.value ?? "");
	const [listRef, setListRef] = useState<HTMLDivElement | null>(null);
	const [tabRefs, setTabRefs] = useState<
		Record<string, HTMLButtonElement | null>
	>({});
	const setTabRef = (tabValue: string) => (node: HTMLButtonElement | null) =>
		setTabRefs(refs =>
			refs[tabValue] === node ? refs : { ...refs, [tabValue]: node },
		);
	const theme = useMantineTheme();
	const reduceMotion = useReducedMotion() && theme.respectReducedMotion;
	// Lags a frame behind the active tab, so a newly shown panel starts transparent and fades in.
	// Driven from here, not the panel, because hidden panels sit in `<Activity>`, which drops their effects.
	const [revealedValue, setRevealedValue] = useState(activeValue);
	useEffect(() => {
		const frame = requestAnimationFrame(() =>
			setRevealedValue(activeValue),
		);
		return () => cancelAnimationFrame(frame);
	}, [activeValue]);

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
					<Tabs.List
						ref={setListRef}
						style={{ position: "relative" }}>
						{/* Slides between tabs in place of the active pill's own background. */}
						<FloatingIndicator
							target={tabRefs[activeValue]}
							parent={listRef}
							style={{
								backgroundColor: "var(--tabs-color)",
								borderRadius: "var(--tabs-radius)",
							}}
						/>
						{tabs.map(tab => (
							<AppTooltip
								key={tab.value}
								label={tab.title}
								position="bottom">
								<Tabs.Tab
									ref={setTabRef(tab.value)}
									value={tab.value}
									aria-label={tab.title}
									style={{
										zIndex: 1,
										...(tab.value === activeValue && {
											"--tab-bg": "transparent",
										}),
									}}>
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
							<Box
								style={{
									flex: 1,
									minHeight: 0,
									display: "flex",
									flexDirection: "column",
									opacity:
										revealedValue === tab.value ? 1 : 0,
									transition: `opacity ${reduceMotion ? 0 : PANEL_FADE_MS}ms ease`,
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
							</Box>
						</Tabs.Panel>
					);
				})}
			</Tabs>
		</AppShell.Section>
	);
}

export default CollapsibleSidebar;
