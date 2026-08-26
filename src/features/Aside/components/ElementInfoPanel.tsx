import {
	ActionIcon,
	Divider,
	Group,
	Stack,
	Text,
	TagsInput,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "@mantine/hooks";
import useAppSelector from "../../../hooks/useAppSelector";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { updateElementTags } from "../../../api/elements/api/elementsApi";
import { renameElementAction } from "../../../stores/elements/elementsActions";
import { selectCurrentElementDetails } from "../../../stores/elementDetails/elementDetailsSelectors";
import { selectElementRefreshCount } from "../../../stores/sync/syncSelector";
import { formatRelativeDueDate } from "../../../utils/formatRelativeDueDate";
import { ElementId } from "../../../types/elements/elementId";
import { ElementDetailsResponseDto } from "../../../api/elements/dto/elementDetailsDto";
import { openPriorityModal } from "../../../stores/app/appReducer";
import { commandIcon } from "../../../commands/commandIcon";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import ElementProfileRow from "../../Study/components/ElementProfileRow";
import InfoField from "./InfoField";
import InfoGroup from "./InfoGroup";
import ReviewDetails from "./ReviewDetails";
import OriginSection from "./OriginSection";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

function formatDue(due: string | null, finished: boolean): string {
	if (finished) return "Finished";
	if (!due) return "New";
	return formatRelativeDueDate(due);
}

function computeDueState(
	elementType: string,
	details: ElementDetailsResponseDto | null,
): string | null {
	if (!details) return null;
	if (elementType === "card") {
		return formatDue(details.cardReview?.due ?? null, false);
	}
	if (elementType === "learningAsset" || elementType === "extract") {
		const finished = Boolean(details.learningAssetReview?.finishedAt);
		return formatDue(details.learningAssetReview?.due ?? null, finished);
	}
	return null;
}

function ElementInfoPanel() {
	const currentElement = useAppSelector(selectCurrentElement);
	const storedMeta = currentElement?.data.meta ?? null;
	const dispatch = useAppDispatch();
	const details = useAppSelector(selectCurrentElementDetails);
	const refreshCount = useAppSelector(selectElementRefreshCount);

	const debouncedRename = useDebouncedCallback(
		async (id: ElementId, name: string) => {
			if (!name) return;
			await dispatch(renameElementAction(id, name));
		},
		500,
	);

	const debouncedUpdateTags = useDebouncedCallback(
		(id: ElementId, tags: string[]) => updateElementTags(id, tags),
		500,
	);

	const storedName = storedMeta?.name ?? "";
	const nameRef = useRef<HTMLTextAreaElement>(null);
	const [name, setName] = useState(storedName);

	useEffect(() => {
		// Renames from elsewhere (e.g. the sidebar) must land in the field, but
		// the echo of our own debounced rename must not clobber what is being
		// typed here.
		if (document.activeElement === nameRef.current) return;
		setName(storedName);
	}, [storedName]);

	if (!storedMeta) {
		return (
			<Text size="sm" c="dimmed" ta="center" py="xl">
				Select an element to see its details.
			</Text>
		);
	}

	const dueState = computeDueState(storedMeta.elementId.type, details);

	return (
		<Stack gap="lg">
			<InfoGroup title="Details" storageKey="details">
				<InfoField label="Name">
					<AutosizeTextInput
						ref={nameRef}
						size="sm"
						value={name}
						onChange={e => {
							setName(e.currentTarget.value);
							debouncedRename(
								storedMeta.elementId,
								e.currentTarget.value,
							);
						}}
					/>
				</InfoField>
				<InfoField label="Tags">
					<TagsInput
						key={`tags-${storedMeta.elementId.id}-${refreshCount}`}
						placeholder="Enter tag"
						size="sm"
						defaultValue={storedMeta.tags.map(t => t.name)}
						onChange={tags =>
							debouncedUpdateTags(storedMeta.elementId, tags)
						}
					/>
				</InfoField>
				<InfoField label="Created">
					<Text size="sm">
						{new Date(storedMeta.createdAt).toLocaleString()}
					</Text>
				</InfoField>
				<InfoField label="Priority">
					<Group gap={4} wrap="nowrap" align="center">
						<Text size="sm" flex={1}>
							{details
								? `${details.priority.percentage.toFixed(2)}% (${details.priority.rank}/${details.priority.total})`
								: "—"}
						</Text>
						<AppTooltip label="Set priority">
							<ActionIcon
								variant="subtle"
								onClick={() => dispatch(openPriorityModal())}>
								{commandIcon("open-priority")}
							</ActionIcon>
						</AppTooltip>
					</Group>
				</InfoField>
			</InfoGroup>

			<Divider />

			<InfoGroup title="Study" storageKey="study">
				<InfoField label="Study profile">
					<ElementProfileRow
						elementId={storedMeta.elementId}
						details={details}
					/>
				</InfoField>
				<InfoField label="Due">
					<Text size="sm">{dueState ?? "—"}</Text>
				</InfoField>
			</InfoGroup>

			{currentElement &&
				(currentElement.type === "card" ||
					currentElement.type === "learningAsset" ||
					currentElement.type === "extract") && (
					<>
						<Divider />
						<ReviewDetails
							key={`review-${storedMeta.elementId.id}-${refreshCount}`}
							element={currentElement}
							details={details}
						/>
					</>
				)}

			<Divider />

			<OriginSection
				key={`origin-${storedMeta.elementId.id}-${refreshCount}`}
				elementId={storedMeta.elementId}
				bibliographicalSourceId={storedMeta.bibliographicalSourceId}
				derivedFrom={storedMeta.derivedFrom}
				details={details}
			/>
		</Stack>
	);
}

export default ElementInfoPanel;
