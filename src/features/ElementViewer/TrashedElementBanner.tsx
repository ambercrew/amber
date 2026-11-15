import { Alert, Button, Group, Text } from "@mantine/core";
import { ArrowCounterClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import useAppDispatch from "../../hooks/useAppDispatch";
import useAppSelector from "../../hooks/useAppSelector";
import {
	selectCurrentElement,
	selectCurrentElementIsTrashed,
} from "../../stores/elements/elementsSelectors";
import { restoreElementAction } from "../../stores/trash/trashActions";

// The App header grows by exactly this much while the banner is shown, so
// its own height must stay fixed rather than driven by its content.
export const TRASHED_ELEMENT_BANNER_HEIGHT = 52;

export default function TrashedElementBanner() {
	const dispatch = useAppDispatch();
	const currentElement = useAppSelector(selectCurrentElement);
	const isTrashed = useAppSelector(selectCurrentElementIsTrashed);

	if (!isTrashed || !currentElement) return null;

	const elementId = currentElement.data.meta.elementId;

	return (
		<Alert
			color="yellow"
			icon={<TrashIcon size={20} />}
			radius={0}
			h={TRASHED_ELEMENT_BANNER_HEIGHT}
			styles={{
				root: { paddingBlock: 0 },
				wrapper: { height: "100%", alignItems: "center" },
			}}>
			<Group justify="space-between" wrap="nowrap" gap="sm">
				<Text size="sm">This element is in the trash.</Text>
				<Button
					variant="transparent"
					leftSection={<ArrowCounterClockwiseIcon size={16} />}
					onClick={() =>
						void dispatch(restoreElementAction(elementId))
					}>
					Restore
				</Button>
			</Group>
		</Alert>
	);
}
