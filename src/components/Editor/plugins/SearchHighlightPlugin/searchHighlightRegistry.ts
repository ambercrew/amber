/**
 * Aggregates match ranges from every mounted editor, plus the current match.
 * `SearchHighlightOverlay` paints them by subscribing to changes. A module
 * singleton so editors and the overlay share it without prop drilling.
 */
class SearchHighlightRegistry {
	// Index-aligned with the editor's matches; `null` where a match has no DOM range yet.
	private readonly allRanges = new Map<string, (Range | null)[]>();
	private currentRange: Range | null = null;
	private readonly listeners = new Set<() => void>();

	/** The ranges last reported by a given editor, for scrolling to an exact match. */
	getRanges(editorKey: string): (Range | null)[] | undefined {
		return this.allRanges.get(editorKey);
	}

	/** Every range across every editor, flattened. */
	getAllRangesFlat(): Range[] {
		return Array.from(this.allRanges.values())
			.flat()
			.filter(range => range !== null);
	}

	getCurrentRange(): Range | null {
		return this.currentRange;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setAll(editorKey: string, ranges: (Range | null)[]): void {
		this.allRanges.set(editorKey, ranges);
		this.notify();
	}

	clear(editorKey: string): void {
		this.allRanges.delete(editorKey);
		this.notify();
	}

	setCurrent(range: Range | null): void {
		this.currentRange = range;
		this.notify();
	}

	clearAll(): void {
		this.allRanges.clear();
		this.currentRange = null;
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

export const searchHighlightRegistry = new SearchHighlightRegistry();
