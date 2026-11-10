import { ActionIcon, Group, NavLink } from "@mantine/core";
import { ArrowCounterClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { memo, MouseEvent } from "react";
import { useNavigate } from "react-router";
import { TrashedElementDto } from "../../../api/trash/dto/trashedElementDto";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import ElementNodeIcon from "../../../components/ElementNodeIcon/ElementNodeIcon";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { paths } from "../../../paths";
import { restoreElementAction } from "../../../stores/trash/trashActions";
import { formatTrashCountdown } from "../../../utils/formatTrashCountdown";

const ICON_SIZE = 18;

// The row itself opens the element, so its buttons keep their clicks to themselves.
function withoutOpening(action: () => void) {
	return (event: MouseEvent) => {
		event.stopPropagation();
		action();
	};
}

interface TrashRowProps {
	item: TrashedElementDto;
	active: boolean;
	retentionDays: number;
	onDelete: (item: TrashedElementDto) => void;
}

function TrashRow({ item, active, retentionDays, onDelete }: TrashRowProps) {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const { elementId } = item;

	return (
		<NavLink
			label={item.name}
			description={
				retentionDays > 0
					? formatTrashCountdown(item.trashedAt, retentionDays)
					: undefined
			}
			active={active}
			leftSection={
				<ElementNodeIcon type={elementId.type} size={ICON_SIZE} />
			}
			rightSection={
				<Group gap={2} wrap="nowrap">
					<AppTooltip label="Restore">
						<ActionIcon
							variant="subtle"
							aria-label="Restore"
							onClick={withoutOpening(() => {
								void dispatch(restoreElementAction(elementId));
							})}>
							<ArrowCounterClockwiseIcon size={16} />
						</ActionIcon>
					</AppTooltip>
					<AppTooltip label="Delete permanently">
						<ActionIcon
							variant="subtle"
							color="red"
							aria-label="Delete permanently"
							onClick={withoutOpening(() => onDelete(item))}>
							<TrashIcon size={16} />
						</ActionIcon>
					</AppTooltip>
				</Group>
			}
			onClick={() =>
				void navigate(paths.element(elementId.type, elementId.id))
			}
		/>
	);
}

// The list re-renders on every scroll step, which shouldn't reach rows that stay.
export default memo(TrashRow);
