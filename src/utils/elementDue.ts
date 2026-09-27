import { ElementDetailsResponseDto } from "../api/elements/dto/elementDetailsDto";

export function dueIsoFor(
	details: ElementDetailsResponseDto | null,
): string | null {
	if (!details) return null;
	return details.cardReview?.due ?? details.learningAssetReview?.due ?? null;
}

/** Folders are never reviewed, so they are the only elements without a due date. */
export function hasDue(elementType: string): boolean {
	return (
		elementType === "card" ||
		elementType === "learningAsset" ||
		elementType === "extract"
	);
}
