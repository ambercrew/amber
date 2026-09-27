import { AppShell, Box, Group } from "@mantine/core";
import { CompassIcon, QueueIcon, TrashIcon } from "@phosphor-icons/react";
import { useWindowEvent } from "@mantine/hooks";
import CollapsibleSidebar from "../../../components/CollapsibleSidebar/CollapsibleSidebar";
import { useSidebarTab } from "../../../components/CollapsibleSidebar/useSidebarTab";
import { useFocusRequested } from "../../../hooks/useFocusRequest";
import { TOGGLE_LEFT_SIDEBAR_REQUESTED } from "../../../types/events/toggleLeftSidebarRequestedEvent";
import AccountMenu from "./AccountMenu";
import NavigatorPanel from "./NavigatorPanel";
import PriorityQueuePanel from "./PriorityQueuePanel";
import SyncButton from "./SyncButton";
import TrashPanel from "./TrashPanel";
import VerifyEmailBanner from "./VerifyEmailBanner";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectElementTree } from "../../../stores/elements/elementsSelectors";
import { useElementTreeState } from "../hooks/useElementTreeState";

const LOCAL_STORAGE_KEY = "sidebar";

interface SidebarProps {
	onCollapse: () => void;
	onExpand: () => void;
	onToggle: () => void;
}

function Sidebar({ onCollapse, onExpand, onToggle }: SidebarProps) {
	const [, setTab] = useSidebarTab(LOCAL_STORAGE_KEY, "tree");
	const treeState = useElementTreeState(useAppSelector(selectElementTree));

	useWindowEvent(TOGGLE_LEFT_SIDEBAR_REQUESTED, onToggle);
	// Reveal the tree; it focuses itself once mounted.
	useFocusRequested("tree", () => {
		onExpand();
		setTab("tree");
	});

	return (
		<>
			<CollapsibleSidebar
				defaultValue="tree"
				onCollapse={onCollapse}
				localStorageKey={LOCAL_STORAGE_KEY}
				tabs={[
					{
						value: "tree",
						title: "Navigator — browse and organize your learning materials",
						icon: <CompassIcon size={16} />,
						panel: <NavigatorPanel treeState={treeState} />,
						padded: false,
					},
					{
						value: "priority-queue",
						title: "Priority queue - used for reviewing your learning materials",
						icon: <QueueIcon size={16} />,
						panel: <PriorityQueuePanel />,
						padded: false,
					},
					{
						value: "trash",
						title: "Trash - deleted elements you can still restore",
						icon: <TrashIcon size={16} />,
						panel: <TrashPanel />,
						padded: false,
					},
				]}
			/>
			<VerifyEmailBanner />
			<AppShell.Section p="xs">
				<Group gap="xs" wrap="nowrap">
					<Box flex={1} miw={0}>
						<AccountMenu />
					</Box>
					<SyncButton />
				</Group>
			</AppShell.Section>
		</>
	);
}

export default Sidebar;
