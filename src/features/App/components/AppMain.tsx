import { Outlet } from "react-router";
import { AppShell, ScrollArea } from "@mantine/core";
import useAppSelector from "../../../hooks/useAppSelector";
import { useChromeInsets } from "../../../hooks/useChromeInsets";
import { selectStudyStatus } from "../../../stores/study/studySelectors";
import { searchHighlightHostProps } from "../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightHost";
import { SAFE_AREA_BOTTOM } from "../../../utils/safeArea";

interface AppMainProps {
	onMainScrollElement: (element: HTMLElement | null) => void;
	onVisibleAreaElement: (element: HTMLElement | null) => void;
}

/** The routed page, in the scroll area the header and footer float over. */
export default function AppMain({
	onMainScrollElement,
	onVisibleAreaElement,
}: AppMainProps) {
	const studying = useAppSelector(selectStudyStatus) === "studying";
	const insets = useChromeInsets();

	// Chrome floats above the scroll viewport; these reserve its space via the fixed *-height variables
	// (not *-offset), so hiding it never reflows the content.
	const headerSpace = "var(--app-shell-header-height, 0px)";
	const footerSpace = `calc(${
		studying ? "var(--app-shell-footer-height, 0px)" : "0px"
	} + ${SAFE_AREA_BOTTOM})`;

	return (
		<AppShell.Main
			p={0}
			style={{
				position: "fixed",
				minHeight: 0,
				top: 0,
				bottom: 0,
				insetInlineStart: "var(--app-shell-navbar-offset, 0rem)",
				insetInlineEnd: "var(--app-shell-aside-offset, 0rem)",
				transitionProperty: "inset-inline-start, inset-inline-end",
			}}>
			<ScrollArea
				h="100%"
				scrollbars="y"
				viewportRef={onMainScrollElement}
				viewportProps={{
					...searchHighlightHostProps,
					style: {
						// Opaque, so Chromium scrolls it on the compositor; otherwise it repaints every frame (slow with many equations).
						backgroundColor: "var(--mantine-color-body)",
						paddingInline: "var(--app-shell-padding)",
						paddingTop: `calc(${headerSpace} + var(--app-shell-padding))`,
						paddingBottom: `calc(${footerSpace} + var(--app-shell-padding))`,
						scrollPaddingTop: headerSpace,
						scrollPaddingBottom: footerSpace,
					},
				}}
				styles={{
					scrollbar: {
						top: insets.top,
						bottom: insets.bottom,
						// Keeps Mantine's own hover fade alongside the inset animation.
						transition: `${insets.transition}, background-color 150ms ease, opacity 150ms ease`,
					},
					content: { display: "block" },
				}}>
				<Outlet />
			</ScrollArea>
			{/* What the header and footer leave visible, for floating menus to stay inside. */}
			<div
				ref={onVisibleAreaElement}
				aria-hidden
				style={{
					position: "absolute",
					insetInline: 0,
					top: insets.top,
					bottom: insets.bottom,
					transition: insets.transition,
					visibility: "hidden",
					pointerEvents: "none",
				}}
			/>
		</AppShell.Main>
	);
}
