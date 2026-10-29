import { Menu } from "@mantine/core";
import {
	PencilSimpleIcon,
	PlusIcon,
	TargetIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { ElementId } from "../../../../types/elements/elementId";
import CreateElementDropDown from "../CreateElementMenuDropDown";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import useAppSelector from "../../../../hooks/useAppSelector";
import { changeStudyScopeAction } from "../../../../stores/study/studyScopeActions";
import { selectStudyStatus } from "../../../../stores/study/studySelectors";
import { elementStudyScope } from "../../../../utils/studyScope";
import { useRecentCustomQueries } from "../../../Study/hooks/useRecentCustomQueries";
import { elementTypeOptions } from "../../../../utils/elementTypeOptions";
import { ElementNodeType } from "../../../../types/elements/elementNodeType";
import { useRunCommand } from "../../../../commands/useRunCommand";

function elementTypeLabel(type: ElementNodeType): string {
	const label = elementTypeOptions.find(
		option => option.value === type,
	)?.label;
	return (label ?? type).toLowerCase();
}

function ElementTreeMenuItems({
	elementId,
	onRenameClick,
	onTrashClick,
	onAfterCreate,
}: {
	elementId: ElementId;
	onRenameClick: () => void;
	onTrashClick: () => void;
	onAfterCreate: () => void;
}) {
	const dispatch = useAppDispatch();
	const runCommand = useRunCommand();
	const isStudying = useAppSelector(selectStudyStatus) === "studying";
	const { remember } = useRecentCustomQueries();

	return (
		<>
			<Menu.Sub openDelay={120} closeDelay={150}>
				<Menu.Sub.Target>
					<Menu.Sub.Item leftSection={<PlusIcon size={16} />}>
						New
					</Menu.Sub.Item>
				</Menu.Sub.Target>
				<CreateElementDropDown
					elementId={elementId}
					onAfterCreate={onAfterCreate}
				/>
			</Menu.Sub>
			<Menu.Divider />
			{/* Like the scope setting, locked while a session runs. */}
			<Menu.Item
				leftSection={<TargetIcon size={16} />}
				disabled={isStudying}
				onClick={() => {
					const scope = elementStudyScope(elementId);
					dispatch(changeStudyScopeAction(scope));
					remember(scope.filters);
					runCommand("enter-study-mode");
				}}>
				Scope study to this {elementTypeLabel(elementId.type)}
			</Menu.Item>
			<Menu.Divider />
			<Menu.Item
				leftSection={<PencilSimpleIcon size={16} />}
				onClick={onRenameClick}>
				Rename
			</Menu.Item>
			<Menu.Divider />
			<Menu.Item
				leftSection={<TrashIcon size={16} />}
				color="red"
				onClick={onTrashClick}>
				Move to trash
			</Menu.Item>
		</>
	);
}

export default ElementTreeMenuItems;
