import { useRef, useState } from "react";
import { AppShellResizeSection, useAppShellResize } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import { useIsSmallScreen } from "../../../hooks/useIsSmallScreen";
import { useCloseSidebarOnSmallScreenNavigation } from "../../../hooks/useCloseSidebarOnSmallScreenNavigation";
import useBackButtonPress from "../../../hooks/useBackButtonPress";
import { BackButtonPriority } from "../../../managers/backButtonManager";

const PANEL_MIN = 160;
// Dragging a panel narrower than this collapses it.
const PANEL_COLLAPSE_AT = 120;

/** The sidebar and side panel: whether each is open, and their resize handles. */
export function useAppPanels() {
	const isSmallScreen = useIsSmallScreen();
	const [sidebarExpanded, setSidebarExpanded] = useState(!isSmallScreen);
	const [asideExpanded, setAsideExpanded] = useState(false);

	const { width: viewportWidth } = useViewportSize();
	// Width each panel had before a drag collapsed it, keyed by panel.
	const dragCollapsed = useRef<
		Partial<Record<AppShellResizeSection, number | undefined>>
	>({});
	const resize = useAppShellResize({
		navbar: {
			min: PANEL_MIN,
			max: viewportWidth ? viewportWidth * 0.4 : undefined,
			collapseThreshold: PANEL_COLLAPSE_AT,
			label: "Resize sidebar",
		},
		aside: {
			min: PANEL_MIN,
			max: viewportWidth ? viewportWidth * 0.35 : undefined,
			collapseThreshold: PANEL_COLLAPSE_AT,
			label: "Resize side panel",
		},
		onCollapseChange: (section, collapsed) => {
			if (collapsed)
				dragCollapsed.current[section] = resize[section].size;
			else delete dragCollapsed.current[section];
			if (section === "navbar") setSidebarExpanded(!collapsed);
			if (section === "aside") setAsideExpanded(!collapsed);
		},
		onResizeEnd: () => {
			// Otherwise a panel collapsed by dragging reopens at its minimum width.
			for (const [section, width] of Object.entries(
				dragCollapsed.current,
			)) {
				const controller = resize[section as AppShellResizeSection];
				if (width === undefined) controller.reset();
				else controller.setSize(width);
			}
			dragCollapsed.current = {};
		},
	});

	useCloseSidebarOnSmallScreenNavigation(() => {
		setSidebarExpanded(false);
		setAsideExpanded(false);
	});

	// The panels cover the screen on small viewports, so back closes whichever
	// is on top — but only once nothing is layered over them.
	useBackButtonPress(
		() => {
			if (asideExpanded) setAsideExpanded(false);
			else setSidebarExpanded(false);
		},
		isSmallScreen && (sidebarExpanded || asideExpanded),
		BackButtonPriority.Low,
	);

	return {
		resize,
		sidebarExpanded,
		setSidebarExpanded,
		asideExpanded,
		setAsideExpanded,
	};
}
