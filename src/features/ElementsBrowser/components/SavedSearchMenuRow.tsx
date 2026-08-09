import { ActionIcon, Menu, Text } from "@mantine/core";
import {
	CheckIcon,
	CopySimpleIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";

interface SavedSearchMenuRowProps {
	savedSearch: SavedSearchResponseDto;
	selected: boolean;
	onSelect: () => void;
	onRename: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
}

export default function SavedSearchMenuRow({
	savedSearch,
	selected,
	onSelect,
	onRename,
	onDuplicate,
	onDelete,
}: SavedSearchMenuRowProps) {
	return (
		<Menu.Item
			component="div"
			onClick={onSelect}
			leftSection={
				selected ? (
					<CheckIcon size={14} />
				) : (
					<span style={{ width: 14, display: "inline-block" }} />
				)
			}
			rightSection={
				<Menu shadow="md" position="right-start" withinPortal>
					<Menu.Target>
						<ActionIcon
							variant="subtle"
							size="sm"
							aria-label={`${savedSearch.name} actions`}
							onClick={event => event.stopPropagation()}>
							<DotsThreeIcon size={16} weight="bold" />
						</ActionIcon>
					</Menu.Target>
					<Menu.Dropdown onClick={event => event.stopPropagation()}>
						<Menu.Item
							leftSection={<PencilSimpleIcon size={14} />}
							onClick={onRename}>
							Rename
						</Menu.Item>
						<Menu.Item
							leftSection={<CopySimpleIcon size={14} />}
							onClick={onDuplicate}>
							Duplicate
						</Menu.Item>
						<Menu.Item
							color="red"
							leftSection={<TrashIcon size={14} />}
							onClick={onDelete}>
							Delete
						</Menu.Item>
					</Menu.Dropdown>
				</Menu>
			}>
			<Text truncate maw={160}>
				{savedSearch.name}
			</Text>
		</Menu.Item>
	);
}
