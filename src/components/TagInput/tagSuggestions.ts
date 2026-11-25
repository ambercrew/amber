/** Replaces each tag added to `previous` with the existing tag it matches case-insensitively. */
export function matchExistingTags(
	next: string[],
	previous: string[],
	existing: string[],
): string[] {
	const kept = new Set(previous);
	if (next.every(tag => kept.has(tag))) return next;

	const byLowerCase = new Map<string, string>();
	for (const tag of existing) {
		const key = tag.toLowerCase();
		if (!byLowerCase.has(key)) byLowerCase.set(key, tag);
	}
	return next.map(tag =>
		kept.has(tag) ? tag : (byLowerCase.get(tag.toLowerCase()) ?? tag),
	);
}
