import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { AppShell, Box, ScrollArea } from "@mantine/core";
import { useSplitter } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { useRedirectIfElementMissing } from "../../../hooks/useRedirectIfElementMissing";
import {
	SMALL_SCREEN_BREAKPOINT,
	useIsSmallScreen,
} from "../../../hooks/useIsSmallScreen";
import { useCurrentElementSync } from "../../../hooks/useCurrentElementSync";
import { useElementSyncRefresh } from "../../../hooks/useElementSyncRefresh";
import { useStudySessionFinishedRefresh } from "../../../hooks/useStudySessionFinishedRefresh";
import { usePostSyncRefresh } from "../../../hooks/usePostSyncRefresh";
import { useCloseSidebarOnSmallScreenNavigation } from "../../../hooks/useCloseSidebarOnSmallScreenNavigation";
import { useStudySessionGuard } from "../../Study/hooks/useStudySessionGuard";
import { useStudySessionSummaryToast } from "../../Study/hooks/useStudySessionSummaryToast";
import Updater from "../../Updater/components/Updater";
import CommandPalette from "../../../commands/CommandPalette";
import StudySessionBar from "../../Study/components/StudySessionBar.tsx";
import { initialLoadApplicationState } from "../../../stores/app/appActions.ts";
import useAppSelector from "../../../hooks/useAppSelector.ts";
import { selectAreSettingsLoaded } from "../../../stores/settings/settingsSelector.ts";
import { selectStudyStatus } from "../../../stores/study/studySelectors.ts";
import { selectCurrentElementIsTrashed } from "../../../stores/elements/elementsSelectors.ts";
import Sidebar from "../../Sidebar/components/Sidebar.tsx";
import Aside from "../../Aside/components/Aside.tsx";
import ResizeHandle from "../../../components/ResizeHandle/ResizeHandle.tsx";
import ImportModal from "../../Import/components/ImportModal.tsx";
import StudyProfileModal from "../../Study/components/StudyProfileModal.tsx";
import SettingsModal from "../../Settings/components/SettingsModal.tsx";
import PriorityModal from "../../Aside/components/PriorityModal.tsx";
import StudySessionSettingsModal from "../../Study/components/StudySessionSettingsModal.tsx";
import AuthModal from "../../Auth/components/AuthModal.tsx";
import VerifyEmailModal from "../../Auth/components/VerifyEmailModal.tsx";
import ManageAccountModal from "../../Auth/components/ManageAccountModal.tsx";
import SyncingModal from "../../Sidebar/components/SyncingModal.tsx";
import AppHeader from "./AppHeader.tsx";
import TrashedElementBanner, {
	TRASHED_ELEMENT_BANNER_HEIGHT,
} from "../../ElementViewer/TrashedElementBanner.tsx";
import SafeAreaTopBackdrop from "../../../components/SafeAreaTopBackdrop/SafeAreaTopBackdrop.tsx";
import { isMobile } from "../../../utils/tauriUtils.ts";
import {
	SAFE_AREA_BOTTOM,
	SAFE_AREA_TOP,
	safeAreaTopStyle,
} from "../../../utils/safeArea.ts";
import useBackButtonPress from "../../../hooks/useBackButtonPress.ts";
import { BackButtonPriority } from "../../../managers/backButtonManager.ts";
import { useLexicalConversionBridge } from "../hooks/useLexicalConversionBridge.ts";
import { MainScrollContext } from "../context/mainScrollContext.ts";
import { useElementHeadroom } from "../../../hooks/useElementHeadroom.ts";
import { useWheelZoom } from "../../../hooks/useWheelZoom.ts";

// Must be defined manually otherwise hiding header or footer when scrolling won't work.
export const HEADER_AND_FOOTER_HEIGHT = 56;
// Shared with anything that needs to mirror the header's pinned state.
export const HEADROOM_FIXED_AT = 120;
const SIDEBAR_DEFAULT = 320;
const ASIDE_DEFAULT = 320;

function App() {
	const [mainElement, setMainElement] = useState<HTMLElement | null>(null);
	const { pinned } = useElementHeadroom({
		element: mainElement,
		fixedAt: HEADROOM_FIXED_AT,
	});

	const isSmallScreen = useIsSmallScreen();
	const [sidebarExpanded, setSidebarExpanded] = useState(!isSmallScreen);
	const [asideExpanded, setAsideExpanded] = useState(false);
	const dispatch = useAppDispatch();
	const areSettingsLoaded = useAppSelector(selectAreSettingsLoaded);
	const studyStatus = useAppSelector(selectStudyStatus);
	const isCurrentElementTrashed = useAppSelector(
		selectCurrentElementIsTrashed,
	);
	const mobile = isMobile();
	const safeAreaTop = safeAreaTopStyle();
	const studying = studyStatus === "studying";
	const footerCollapsed = !studying || !pinned;

	// Chrome floats above the scroll viewport; these reserve the space it covers
	// via the fixed *-height variables (not *-offset), so hiding it never reflows
	// the content.
	const headerSpace = "var(--app-shell-header-height, 0px)";
	const footerSpace = studying
		? `calc(var(--app-shell-footer-height, 0px) + ${SAFE_AREA_BOTTOM})`
		: "0px";

	const splitter = useSplitter({
		panels: [
			{
				defaultSize: `${SIDEBAR_DEFAULT}px`,
				min: "160px",
				max: "40%",
				collapsible: true,
			},
			{ defaultSize: 100 },
			{
				defaultSize: `${ASIDE_DEFAULT}px`,
				min: "160px",
				max: "35%",
				collapsible: true,
			},
		],
		enabled: !isSmallScreen,
		onCollapseChange: (index, collapsed) => {
			if (index === 0) setSidebarExpanded(!collapsed);
			if (index === 2) setAsideExpanded(!collapsed);
		},
	});

	useCloseSidebarOnSmallScreenNavigation(() => {
		splitter.collapse(0);
		setAsideExpanded(false);
	});

	// The panels cover the screen on small viewports, so back closes whichever
	// is on top — but only once nothing is layered over them.
	useBackButtonPress(
		() => {
			if (asideExpanded) setAsideExpanded(false);
			else splitter.collapse(0);
		},
		isSmallScreen && (sidebarExpanded || asideExpanded),
		BackButtonPriority.Low,
	);
	useRedirectIfElementMissing();
	useCurrentElementSync();
	useElementSyncRefresh();
	useStudySessionFinishedRefresh();
	usePostSyncRefresh();
	useStudySessionGuard();
	useStudySessionSummaryToast();
	useLexicalConversionBridge();
	useWheelZoom();

	const navbarWidth =
		parseFloat(String(splitter.sizes[0])) || SIDEBAR_DEFAULT;
	const asideWidth = parseFloat(String(splitter.sizes[2])) || ASIDE_DEFAULT;

	useEffect(() => {
		const contextMenuCb = (e: MouseEvent) => {
			if (!import.meta.env.DEV) e.preventDefault();
		};
		window.addEventListener("contextmenu", contextMenuCb);
		return () => window.removeEventListener("contextmenu", contextMenuCb);
	}, []);

	useEffect(() => {
		void dispatch(initialLoadApplicationState());
	}, [dispatch]);

	if (!areSettingsLoaded) return null;

	return (
		<MainScrollContext value={mainElement}>
			<AppShell
				// eslint-disable-next-line react-hooks/refs
				ref={splitter.ref}
				mode="fixed"
				layout="alt"
				h="100dvh"
				style={{
					overflow: "hidden",
					"--app-shell-transition-duration": "calc(200ms * 2)",
				}}
				navbar={{
					width: navbarWidth,
					breakpoint: SMALL_SCREEN_BREAKPOINT,
					collapsed: {
						desktop: !sidebarExpanded,
						mobile: !sidebarExpanded,
					},
				}}
				aside={{
					width: asideWidth,
					breakpoint: SMALL_SCREEN_BREAKPOINT,
					collapsed: {
						desktop: !asideExpanded,
						mobile: !asideExpanded,
					},
				}}
				header={{
					height: mobile
						? `calc(${HEADER_AND_FOOTER_HEIGHT}px + ${SAFE_AREA_TOP}${
								isCurrentElementTrashed
									? ` + ${TRASHED_ELEMENT_BANNER_HEIGHT}px`
									: ""
							})`
						: HEADER_AND_FOOTER_HEIGHT +
							(isCurrentElementTrashed
								? TRASHED_ELEMENT_BANNER_HEIGHT
								: 0),
					collapsed: !pinned,
					offset: false,
				}}
				footer={{
					height: HEADER_AND_FOOTER_HEIGHT,
					collapsed: footerCollapsed,
					offset: false,
				}}
				padding="md">
				{!mobile && <Updater />}
				<CommandPalette />
				<ImportModal />
				<StudyProfileModal />
				<SettingsModal />
				<PriorityModal />
				<StudySessionSettingsModal />
				<AuthModal />
				<VerifyEmailModal />
				<ManageAccountModal />
				<SyncingModal />
				<Notifications />
				<SafeAreaTopBackdrop />

				<AppShell.Header style={safeAreaTop}>
					<Box h={HEADER_AND_FOOTER_HEIGHT}>
						<AppHeader
							onToggleSidebar={() => splitter.toggleCollapse(0)}
							onToggleAside={() => setAsideExpanded(v => !v)}
						/>
					</Box>
					<TrashedElementBanner />
				</AppShell.Header>

				<AppShell.Footer
					style={
						mobile && footerCollapsed
							? {
									transform: `translateY(calc(var(--app-shell-footer-height) + ${SAFE_AREA_BOTTOM}))`,
								}
							: undefined
					}>
					<StudySessionBar />
				</AppShell.Footer>

				<AppShell.Navbar style={safeAreaTop}>
					<Sidebar onCollapse={() => splitter.collapse(0)} />
					{!isSmallScreen && (
						<ResizeHandle
							side="right"
							// eslint-disable-next-line react-hooks/refs
							handleProps={splitter.getHandleProps({ index: 0 })}
						/>
					)}
				</AppShell.Navbar>

				<AppShell.Main
					p={0}
					style={{
						position: "fixed",
						minHeight: 0,
						top: 0,
						bottom: 0,
						insetInlineStart:
							"var(--app-shell-navbar-offset, 0rem)",
						insetInlineEnd: "var(--app-shell-aside-offset, 0rem)",
						transitionProperty:
							"inset-inline-start, inset-inline-end",
					}}>
					<ScrollArea
						h="100%"
						type="auto"
						scrollbars="y"
						viewportRef={setMainElement}
						viewportProps={{
							style: {
								paddingInline: "var(--app-shell-padding)",
								paddingTop: `calc(${headerSpace} + var(--app-shell-padding))`,
								paddingBottom: `calc(${footerSpace} + var(--app-shell-padding))`,
								scrollPaddingTop: headerSpace,
								scrollPaddingBottom: footerSpace,
							},
						}}
						styles={{
							scrollbar: {
								top: headerSpace,
								bottom: footerSpace,
							},
							content: { display: "block" },
						}}>
						<Outlet />
					</ScrollArea>
				</AppShell.Main>

				<AppShell.Aside style={safeAreaTop}>
					<Aside onCollapse={() => setAsideExpanded(false)} />
					{!isSmallScreen && (
						<ResizeHandle
							side="left"
							// eslint-disable-next-line react-hooks/refs
							handleProps={splitter.getHandleProps({ index: 1 })}
						/>
					)}
				</AppShell.Aside>
			</AppShell>
		</MainScrollContext>
	);
}

export default App;
