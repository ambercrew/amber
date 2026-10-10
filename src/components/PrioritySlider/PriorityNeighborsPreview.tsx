import { useEffect, useState } from "react";
import { Group, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import ElementNodeIcon from "../ElementNodeIcon/ElementNodeIcon";
import { getPriorityNeighbors } from "../../api/elements/api/elementsApi";
import {
	PriorityNeighborDto,
	PriorityNeighborsResponseDto,
} from "../../api/elements/dto/priorityNeighborsDto";
import useApi from "../../hooks/useApi";
import { ElementId } from "../../types/elements/elementId";
import { ElementNodeType } from "../../types/elements/elementNodeType";

/** Waits for the slider to settle before asking for that position's neighbors. */
const NEIGHBORS_DEBOUNCE_MS = 150;

/** The element being placed; `id` is `null` for one not created yet. */
export interface PlacedElement {
	id: ElementId | null;
	type: ElementNodeType;
	name: string;
}

// The priority modal remounts after each commit, sooner than the debounce;
// starting from the element's last result keeps the modal from flashing.
let lastPreview: {
	key: string;
	neighbors: PriorityNeighborsResponseDto;
} | null = null;

function previewKey(id: ElementId | null): string {
	return id ? `${id.type}:${id.id}` : "new";
}

interface PriorityNeighborsPreviewProps {
	element: PlacedElement;
	position: number;
}

/** The placed element, highlighted between the elements reviewed just before
 * and just after it at `position`. */
function PriorityNeighborsPreview({
	element,
	position,
}: PriorityNeighborsPreviewProps) {
	const [debouncedPosition] = useDebouncedValue(
		position,
		NEIGHBORS_DEBOUNCE_MS,
	);
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	const [neighbors, setNeighbors] =
		useState<PriorityNeighborsResponseDto | null>(() =>
			lastPreview?.key === previewKey(element.id)
				? lastPreview.neighbors
				: null,
		);

	useEffect(() => {
		let cancelled = false;
		void callApi(() =>
			getPriorityNeighbors(element.id, debouncedPosition),
		).then(result => {
			if (cancelled || !result) return;
			clearErrorMessage();
			setNeighbors(result);
			lastPreview = {
				key: previewKey(element.id),
				neighbors: result,
			};
		});
		return () => {
			cancelled = true;
		};
	}, [callApi, clearErrorMessage, element.id, debouncedPosition]);

	if (errorMessage) {
		return (
			<Text size="xs" c="red">
				{errorMessage}
			</Text>
		);
	}
	if (!neighbors?.before && !neighbors?.after) return null;

	return (
		<Stack gap={2}>
			{neighbors.before && (
				<PreviewRow label="Before" {...neighborRow(neighbors.before)} />
			)}
			<PreviewRow
				label="Current"
				type={element.type}
				name={element.name}
				highlighted
			/>
			{neighbors.after && (
				<PreviewRow label="After" {...neighborRow(neighbors.after)} />
			)}
		</Stack>
	);
}

function neighborRow(neighbor: PriorityNeighborDto) {
	return { type: neighbor.elementId.type, name: neighbor.name };
}

function PreviewRow({
	label,
	type,
	name,
	highlighted = false,
}: {
	label: string;
	type: ElementNodeType;
	name: string;
	highlighted?: boolean;
}) {
	return (
		<Group
			gap="xs"
			wrap="nowrap"
			px="xs"
			py={2}
			bg={highlighted ? "var(--mantine-primary-color-light)" : undefined}
			style={{ borderRadius: "var(--mantine-radius-sm)" }}>
			<Text size="xs" c="dimmed" w={48} style={{ flexShrink: 0 }}>
				{label}
			</Text>
			<ElementNodeIcon type={type} size={14} />
			<Text size="sm" truncate fw={highlighted ? 600 : undefined}>
				{name}
			</Text>
		</Group>
	);
}

export default PriorityNeighborsPreview;
