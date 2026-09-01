export const ALL_HIGHLIGHT_NAME = "amber-find-all";
export const CURRENT_HIGHLIGHT_NAME = "amber-find-current";

/**
 * CSS Custom Highlight API support lags behind on some Android system
 * WebViews and Windows machines on an outdated WebView2 runtime. When it's
 * missing, `SearchHighlightOverlay` paints the same ranges itself by reading
 * `getAllRangesFlat`/`getCurrentRange` and subscribing to changes.
 */
export function supportsHighlightApi(): boolean {
	return (
		typeof CSS !== "undefined" &&
		"highlights" in CSS &&
		typeof Highlight !== "undefined"
	);
}

/**
 * Thin wrapper around the CSS Custom Highlight API, aggregating ranges from
 * every mounted editor into two shared highlight names ("all matches",
 * "current match"). A module singleton since `CSS.highlights` is itself a
 * global registry.
 */
class SearchHighlightRegistry {
	private readonly allRanges = new Map<string, Range[]>();
	private currentRange: Range | null = null;
	private readonly listeners = new Set<() => void>();

	/** The ranges last reported by a given editor, for scrolling to an exact match. */
	getRanges(editorKey: string): Range[] | undefined {
		return this.allRanges.get(editorKey);
	}

	/** Every range across every editor, flattened — used by the overlay fallback. */
	getAllRangesFlat(): Range[] {
		return Array.from(this.allRanges.values()).flat();
	}

	getCurrentRange(): Range | null {
		return this.currentRange;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setAll(editorKey: string, ranges: Range[]): void {
		this.allRanges.set(editorKey, ranges);
		this.applyAll();
		this.notify();
	}

	clear(editorKey: string): void {
		this.allRanges.delete(editorKey);
		this.applyAll();
		this.notify();
	}

	setCurrent(range: Range | null): void {
		this.currentRange = range;
		this.applyCurrent();
		this.notify();
	}

	clearAll(): void {
		this.allRanges.clear();
		this.currentRange = null;
		this.applyAll();
		this.applyCurrent();
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private applyAll(): void {
		if (!supportsHighlightApi()) return;
		const ranges = this.getAllRangesFlat();
		if (ranges.length === 0) {
			CSS.highlights.delete(ALL_HIGHLIGHT_NAME);
			return;
		}
		CSS.highlights.set(ALL_HIGHLIGHT_NAME, new Highlight(...ranges));
	}

	private applyCurrent(): void {
		if (!supportsHighlightApi()) return;
		if (!this.currentRange) {
			CSS.highlights.delete(CURRENT_HIGHLIGHT_NAME);
			return;
		}
		CSS.highlights.set(
			CURRENT_HIGHLIGHT_NAME,
			new Highlight(this.currentRange),
		);
	}
}

export const searchHighlightRegistry = new SearchHighlightRegistry();
