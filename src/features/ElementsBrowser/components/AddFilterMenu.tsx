import { Button, Menu } from "@mantine/core";
import { PlusIcon } from "@phosphor-icons/react";
import { ElementFilterField } from "../../../types/elements/elementFilter";
import { filterFieldMetas } from "../utils/filterFieldMeta";

export default function AddFilterMenu({
	onSelect,
}: {
	onSelect: (field: ElementFilterField) => void;
}) {
	return (
		<Menu position="bottom-start" shadow="md" withinPortal>
			<Menu.Target>
				<Button
					variant="default"
					radius="xl"
					leftSection={<PlusIcon size={14} />}>
					Filter
				</Button>
			</Menu.Target>
			<Menu.Dropdown>
				<Menu.Label>Filter by</Menu.Label>
				{filterFieldMetas.map(meta => (
					<Menu.Item
						key={meta.field}
						leftSection={meta.icon(16)}
						onClick={() => onSelect(meta.field)}>
						{meta.label}
					</Menu.Item>
				))}
			</Menu.Dropdown>
		</Menu>
	);
}
