import { Fragment } from "react";
import { Button, Menu } from "@mantine/core";
import { PlusIcon } from "@phosphor-icons/react";
import { ElementFilterField } from "../../../../api/savedSearches/dto/elementFilter";
import { filterFieldGroups } from "../../utils/filterFieldMeta";

// Roomier than the content needs, but never wider than the screen.
const MENU_WIDTH = "min(15rem, calc(100vw - 2rem))";

export default function AddFilterMenu({
	onSelect,
}: {
	onSelect: (field: ElementFilterField) => void;
}) {
	return (
		<Menu
			position="bottom-start"
			shadow="md"
			width={MENU_WIDTH}
			withinPortal>
			<Menu.Target>
				<Button
					variant="default"
					radius="xl"
					leftSection={<PlusIcon size={14} />}
					style={{ borderStyle: "dashed" }}>
					Filter
				</Button>
			</Menu.Target>
			<Menu.Dropdown>
				{filterFieldGroups.map((group, index) => (
					<Fragment key={group.label}>
						{index > 0 && <Menu.Divider />}
						<Menu.Label>{group.label}</Menu.Label>
						{group.fields.map(meta => (
							<Menu.Item
								key={meta.field}
								leftSection={meta.icon(16)}
								onClick={() => onSelect(meta.field)}>
								{meta.label}
							</Menu.Item>
						))}
					</Fragment>
				))}
			</Menu.Dropdown>
		</Menu>
	);
}
