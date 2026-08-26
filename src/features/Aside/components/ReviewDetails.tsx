import { NumberInput, Text } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { updateIntervalMultiplier } from "../../../api/elements/api/elementsApi";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { ElementDetailsResponseDto } from "../../../api/elements/dto/elementDetailsDto";
import { ElementId } from "../../../types/elements/elementId";
import InfoField from "./InfoField";
import InfoGroup from "./InfoGroup";

function formatDateTime(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "—";
}

function formatNumber(value: number): string {
	return value.toFixed(2);
}

interface ReviewDetailsProps {
	element: AnyElementDto;
	details: ElementDetailsResponseDto | null;
}

function ReviewDetails({ element, details }: ReviewDetailsProps) {
	const elementId = element.data.meta.elementId;
	const cardReview = details?.cardReview ?? null;
	const learningAssetReview = details?.learningAssetReview ?? null;

	const debouncedUpdateIntervalMultiplier = useDebouncedCallback(
		(id: ElementId, value: number) => updateIntervalMultiplier(id, value),
		500,
	);

	if (element.type === "learningAsset" || element.type === "extract") {
		const finished = Boolean(learningAssetReview?.finishedAt);
		return (
			<InfoGroup
				title="Scheduling"
				storageKey="scheduling"
				defaultOpened={false}>
				<InfoField label="Interval multiplier">
					<NumberInput
						key={`interval-multiplier-${elementId.id}`}
						size="sm"
						min={0}
						step={0.1}
						decimalScale={2}
						defaultValue={element.data.intervalMultiplier}
						onChange={value => {
							if (typeof value === "number") {
								debouncedUpdateIntervalMultiplier(
									elementId,
									value,
								);
							}
						}}
					/>
				</InfoField>
				<InfoField label="Interval (days)">
					<Text size="sm">
						{learningAssetReview
							? formatNumber(learningAssetReview.intervalDays)
							: "—"}
					</Text>
				</InfoField>
				<InfoField label="Last reviewed">
					<Text size="sm">
						{formatDateTime(
							learningAssetReview?.lastReviewed ?? null,
						)}
					</Text>
				</InfoField>
				<InfoField label="Finished">
					<Text size="sm">
						{finished
							? `Yes · ${formatDateTime(learningAssetReview?.finishedAt ?? null)}`
							: "No"}
					</Text>
				</InfoField>
			</InfoGroup>
		);
	}

	if (element.type === "card") {
		return (
			<InfoGroup
				title="Scheduling"
				storageKey="scheduling"
				defaultOpened={false}>
				<InfoField label="State">
					<Text size="sm" tt="capitalize">
						{cardReview?.state ?? "—"}
					</Text>
				</InfoField>
				<InfoField label="Due">
					<Text size="sm">
						{formatDateTime(cardReview?.due ?? null)}
					</Text>
				</InfoField>
				<InfoField label="Stability">
					<Text size="sm">
						{cardReview ? formatNumber(cardReview.stability) : "—"}
					</Text>
				</InfoField>
				<InfoField label="Difficulty">
					<Text size="sm">
						{cardReview ? formatNumber(cardReview.difficulty) : "—"}
					</Text>
				</InfoField>
				<InfoField label="Interval (days)">
					<Text size="sm">{cardReview?.scheduledDays ?? "—"}</Text>
				</InfoField>
				<InfoField label="Learning step">
					<Text size="sm">{cardReview?.learningSteps ?? "—"}</Text>
				</InfoField>
				<InfoField label="Reps">
					<Text size="sm">{cardReview?.reps ?? "—"}</Text>
				</InfoField>
				<InfoField label="Lapses">
					<Text size="sm">{cardReview?.lapses ?? "—"}</Text>
				</InfoField>
				<InfoField label="Last reviewed">
					<Text size="sm">
						{formatDateTime(cardReview?.lastReviewed ?? null)}
					</Text>
				</InfoField>
			</InfoGroup>
		);
	}

	return null;
}

export default ReviewDetails;
