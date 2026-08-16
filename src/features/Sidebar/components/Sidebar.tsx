import { AppShell, Box, Group } from "@mantine/core";
import { CompassIcon, QueueIcon, TrashIcon } from "@phosphor-icons/react";
import CollapsibleSidebar from "../../../components/CollapsibleSidebar/CollapsibleSidebar";
import AccountMenu from "./AccountMenu";
import NavigatorPanel from "./NavigatorPanel";
import PriorityQueuePanel from "./PriorityQueuePanel";
import SyncButton from "./SyncButton";
import TrashPanel from "./TrashPanel";

interface SidebarProps {
	onCollapse: () => void;
}

function Sidebar({ onCollapse }: SidebarProps) {
	return (
		<>
			<CollapsibleSidebar
				defaultValue="tree"
				onCollapse={onCollapse}
				tabs={[
					{
						value: "tree",
						title: "Navigator — browse and organize your learning materials",
						icon: <CompassIcon size={16} />,
						panel: <NavigatorPanel />,
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
