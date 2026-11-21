import { lazy, Suspense } from "react";
import { InfoIcon, ListBulletsIcon } from "@phosphor-icons/react";
import { AiIcon } from "../../../config/icons";
import { useWindowEvent } from "@mantine/hooks";
import { useSidebarTab } from "../../../components/CollapsibleSidebar/useSidebarTab";
import { useFocusRequested } from "../../../hooks/useFocusRequest";
import { TOGGLE_RIGHT_SIDEBAR_REQUESTED } from "../../../types/events/toggleRightSidebarRequestedEvent";
import CollapsibleSidebar, {
	SidebarTab,
} from "../../../components/CollapsibleSidebar/CollapsibleSidebar";
import ElementInfoPanel from "./ElementInfoPanel";
import TableOfContentsPanel from "./TableOfContentsPanel";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelectors";

const LOCAL_STORAGE_KEY = "aside";

interface AsideProps {
	onCollapse: () => void;
	onExpand: () => void;
	onToggle: () => void;
}

// The chat renders Markdown with KaTeX, so it loads after the shell rather than with it.
const AiPanel = lazy(() => import("../../Ai/components/AiPanel"));

function Aside({ onCollapse, onExpand, onToggle }: AsideProps) {
	const settings = useAppSelector(selectSettings);
	const aiEnabled = settings?.enableAi ?? false;
	const [, setTab] = useSidebarTab(LOCAL_STORAGE_KEY, "ai");

	useWindowEvent(TOGGLE_RIGHT_SIDEBAR_REQUESTED, onToggle);
	// Reveal the AI chat; its input focuses itself once mounted.
	useFocusRequested("aiChat", () => {
		onExpand();
		setTab("ai");
	});

	const tabs: SidebarTab[] = [
		...(aiEnabled
			? [
					{
						value: "ai",
						title: "AI",
						icon: <AiIcon size={16} />,
						panel: (
							<Suspense>
								<AiPanel />
							</Suspense>
						),
						scrollable: false,
					},
				]
			: []),
		{
			value: "tableOfContents",
			title: "Table of contents",
			icon: <ListBulletsIcon size={16} />,
			panel: <TableOfContentsPanel onCollapse={onCollapse} />,
		},
		{
			value: "info",
			title: "Element info",
			icon: <InfoIcon size={16} />,
			panel: <ElementInfoPanel />,
		},
	];

	return (
		<CollapsibleSidebar
			defaultValue="ai"
			onCollapse={onCollapse}
			collapsePosition="left"
			localStorageKey={LOCAL_STORAGE_KEY}
			tabs={tabs}
		/>
	);
}

export default Aside;
