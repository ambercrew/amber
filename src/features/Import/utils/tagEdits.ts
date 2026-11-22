/** Tags the user added to, or removed from, the parent's. */
export interface TagEdits {
	added: string[];
	removed: string[];
}

export const NO_TAG_EDITS: TagEdits = { added: [], removed: [] };

/** The edits that turn `base` into `edited`. */
export function tagEditsBetween(base: string[], edited: string[]): TagEdits {
	return {
		added: edited.filter(tag => !base.includes(tag)),
		removed: base.filter(tag => !edited.includes(tag)),
	};
}

/** `base` with `edits` applied, keeping its order and adding new tags at the end. */
export function applyTagEdits(base: string[], edits: TagEdits): string[] {
	const kept = base.filter(tag => !edits.removed.includes(tag));
	return [...kept, ...edits.added.filter(tag => !kept.includes(tag))];
}
