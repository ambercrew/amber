import { InfoIcon, SparkleIcon } from "@phosphor-icons/react";
import CollapsibleSidebar, {
	SidebarTab,
} from "../../../components/CollapsibleSidebar/CollapsibleSidebar";
import ElementInfoPanel from "./ElementInfoPanel";
import AiPanel from "../../Ai/components/AiPanel";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";

interface AsideProps {
	onCollapse: () => void;
}

function Aside({ onCollapse }: AsideProps) {
	const settings = useAppSelector(selectSettings);
	const aiEnabled = settings?.enableAi ?? false;

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
			tabs={tabs}
		/>
	);
}

export default Aside;
