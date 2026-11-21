import { useState } from "react";
import { AppShell, Box } from "@mantine/core";
import useAppSelector from "../../../hooks/useAppSelector";
import { SMALL_SCREEN_BREAKPOINT } from "../../../hooks/useIsSmallScreen";
import { selectAreSettingsLoaded } from "../../../stores/settings/settingsSelectors";
import { selectStudyStatus } from "../../../stores/study/studySelectors";
import { selectCurrentElementIsTrashed } from "../../../stores/elements/elementsSelectors";
import {
	selectIsFooterShown,
	selectIsHeaderPinned,
} from "../../../stores/app/appSelectors";
import StudySessionBar from "../../Study/components/StudySessionBar";
import Sidebar from "../../Sidebar/components/Sidebar";
import Aside from "../../Aside/components/Aside";
import TrashedElementBanner, {
	TRASHED_ELEMENT_BANNER_HEIGHT,
} from "../../ElementViewer/components/TrashedElementBanner";
import SafeAreaTopBackdrop from "../../../components/SafeAreaTopBackdrop/SafeAreaTopBackdrop";
import { AppLayoutContext } from "../../../components/AppLayout/appLayoutContext";
import { HEADER_AND_FOOTER_HEIGHT } from "../../../config/layout";
import { isMobile } from "../../../utils/tauriUtils";
import {
	SAFE_AREA_BOTTOM,
	SAFE_AREA_TOP,
	safeAreaTopStyle,
	safeAreaVerticalStyle,
} from "../../../utils/safeArea";
import { useAppPanels } from "../hooks/useAppPanels";
import { useAppGlobalEffects } from "../hooks/useAppGlobalEffects";
import AppHeader from "./AppHeader";
import AppMain from "./AppMain";
import AppModals from "./AppModals";
import AppNotifications from "./AppNotifications";
import MainScrollHeadroom from "./MainScrollHeadroom";

const SIDEBAR_DEFAULT = 320;
const ASIDE_DEFAULT = 320;

function App() {
	const [mainScrollElement, setMainScrollElement] =
		useState<HTMLElement | null>(null);
	const [visibleAreaElement, setVisibleAreaElement] =
		useState<HTMLElement | null>(null);
	useAppGlobalEffects();
	const {
		resize,
		sidebarExpanded,
		setSidebarExpanded,
		asideExpanded,
		setAsideExpanded,
	} = useAppPanels();

	const areSettingsLoaded = useAppSelector(selectAreSettingsLoaded);
	const studying = useAppSelector(selectStudyStatus) === "studying";
	const pinned = useAppSelector(selectIsHeaderPinned);
	const footerShown = useAppSelector(selectIsFooterShown);
	const isCurrentElementTrashed = useAppSelector(
		selectCurrentElementIsTrashed,
	);
	const mobile = isMobile();
	const safeAreaTop = safeAreaTopStyle();

	// The headroom slides the header and footer by inline transform, never through AppShell's `collapsed`:
	// that rewrites :root CSS variables, restyling every element on the page (slow with many equations).
	const headerStyle = {
		...safeAreaTop,
		transform: pinned
			? undefined
			: "translateY(calc(var(--app-shell-header-height) * -1))",
	};
	const footerStyle = footerShown
		? undefined
		: {
				transform: `translateY(calc(var(--app-shell-footer-height) + ${
					mobile ? SAFE_AREA_BOTTOM : "0px"
				}))`,
			};
	const bannerHeight = isCurrentElementTrashed
		? TRASHED_ELEMENT_BANNER_HEIGHT
		: 0;

	if (!areSettingsLoaded) return null;

	return (
		<AppLayoutContext value={{ mainScrollElement, visibleAreaElement }}>
			<AppShell
				resize={resize}
				mode="fixed"
				layout="alt"
				h="100dvh"
				style={{
					overflow: "hidden",
					"--app-shell-transition-duration": "calc(200ms * 2)",
				}}
				navbar={{
					width: SIDEBAR_DEFAULT,
					breakpoint: SMALL_SCREEN_BREAKPOINT,
					collapsed: {
						desktop: !sidebarExpanded,
						mobile: !sidebarExpanded,
					},
				}}
				aside={{
					width: ASIDE_DEFAULT,
					breakpoint: SMALL_SCREEN_BREAKPOINT,
					collapsed: {
						desktop: !asideExpanded,
						mobile: !asideExpanded,
					},
				}}
				header={{
					height: mobile
						? `calc(${HEADER_AND_FOOTER_HEIGHT + bannerHeight}px + ${SAFE_AREA_TOP})`
						: HEADER_AND_FOOTER_HEIGHT + bannerHeight,
					offset: false,
				}}
				footer={{
					height: HEADER_AND_FOOTER_HEIGHT,
					collapsed: !studying,
					offset: false,
				}}
				padding="md">
				<MainScrollHeadroom element={mainScrollElement} />
				<AppModals />
				<AppNotifications />
				<SafeAreaTopBackdrop />

				<AppShell.Header style={headerStyle}>
					<Box h={HEADER_AND_FOOTER_HEIGHT}>
						<AppHeader
							onToggleSidebar={() => setSidebarExpanded(v => !v)}
							onToggleAside={() => setAsideExpanded(v => !v)}
						/>
					</Box>
					<TrashedElementBanner />
				</AppShell.Header>

				<AppShell.Footer style={footerStyle}>
					<StudySessionBar />
				</AppShell.Footer>

				<AppShell.Navbar style={safeAreaTop}>
					<Sidebar
						onCollapse={() => setSidebarExpanded(false)}
						onExpand={() => setSidebarExpanded(true)}
						onToggle={() => setSidebarExpanded(v => !v)}
					/>
				</AppShell.Navbar>

				<AppMain
					onMainScrollElement={setMainScrollElement}
					onVisibleAreaElement={setVisibleAreaElement}
				/>

				<AppShell.Aside style={safeAreaVerticalStyle()}>
					<Aside
						onCollapse={() => setAsideExpanded(false)}
						onExpand={() => setAsideExpanded(true)}
						onToggle={() => setAsideExpanded(v => !v)}
					/>
				</AppShell.Aside>
			</AppShell>
		</AppLayoutContext>
	);
}

export default App;
