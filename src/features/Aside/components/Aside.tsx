import { InfoIcon, SparkleIcon } from "@phosphor-icons/react";
import { useWindowEvent } from "@mantine/hooks";
import { useSidebarTab } from "../../../components/CollapsibleSidebar/useSidebarTab";
import { useFocusRequested } from "../../../hooks/useFocusRequest";
import { TOGGLE_RIGHT_SIDEBAR_REQUESTED } from "../../../types/events/toggleRightSidebarRequestedEvent";
import CollapsibleSidebar, {
	SidebarTab,
} from "../../../components/CollapsibleSidebar/CollapsibleSidebar";
import ElementInfoPanel from "./ElementInfoPanel";
import AiPanel from "../../Ai/components/AiPanel";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";

const LOCAL_STORAGE_KEY = "aside";

interface AsideProps {
	onCollapse: () => void;
	onExpand: () => void;
	onToggle: () => void;
}

function Aside({ onCollapse, onExpand, onToggle }: AsideProps) {
	const settings = useAppSelector(selectSettings);
	const aiEnabled = settings?.enableAi ?? false;
	const [, setTab] = useSidebarTab(LOCAL_STORAGE_KEY, "info");

	useWindowEvent(TOGGLE_RIGHT_SIDEBAR_REQUESTED, onToggle);
	// Reveal the AI chat; its input focuses itself once mounted.
	useFocusRequested("aiChat", () => {
		onExpand();
		setTab("ai");
	});

	const tabs: SidebarTab[] = [
		{
			value: "info",
			title: "Element info",
			icon: <InfoIcon size={16} />,
			panel: <ElementInfoPanel />,
		},
		...(aiEnabled
			? [
					{
						value: "ai",
						title: "AI",
						icon: <SparkleIcon size={16} />,
						panel: <AiPanel />,
						scrollable: false,
					},
				]
			: []),
	];

	return (
		<CollapsibleSidebar
			defaultValue="info"
			onCollapse={onCollapse}
			collapsePosition="left"
			localStorageKey={LOCAL_STORAGE_KEY}
			tabs={tabs}
		/>
	);
}

export default Aside;
