const NAME_MAX_LENGTH = 50;

// Cuts at the last word boundary within the limit instead of mid-word, so
// names read as a few whole words rather than a truncated fragment.
export function truncateToWords(
	text: string,
	maxLength = NAME_MAX_LENGTH,
): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxLength) return trimmed;

	const truncated = trimmed.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(" ");
	return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}
