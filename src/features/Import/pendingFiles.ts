/** Identifies a file by name, size and modification time, since `File` has no stable id. */
export function fileKey(file: File): string {
	return `${file.name}|${file.size}|${file.lastModified}`;
}

/** Appends `added` to the staged files, skipping any already staged. */
export function addPendingFiles(
	pending: File[] | null,
	added: File[],
): File[] | null {
	const byKey = new Map<string, File>();
	for (const file of [...(pending ?? []), ...added]) {
		if (!byKey.has(fileKey(file))) byKey.set(fileKey(file), file);
	}
	return byKey.size > 0 ? [...byKey.values()] : null;
}
