import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { createDOMRange } from "@lexical/selection";
import { findMatches } from "./findMatches";
import { buildOffsetMap, offsetToPoint } from "./offsetToPoint";
import { searchHighlightRegistry } from "./searchHighlightRegistry";

interface SearchHighlightPluginProps {
	/** Unique key identifying this editor instance among any others on screen. */
	editorKey: string;
	query: string;
	caseSensitive: boolean;
	/** Local index (within this editor's own matches) of the globally-current match, or null if this editor doesn't own it. */
	currentMatchLocalIndex: number | null;
	/** Reports this editor's own match count — authoritative for this editor. */
	onMatches: (editorKey: string, count: number) => void;
}

/**
 * Finds `query` within this editor's text and pushes match ranges into the
 * shared highlight registry, without touching document content.
 */
export default function SearchHighlightPlugin({
	editorKey,
	query,
	caseSensitive,
	currentMatchLocalIndex,
	onMatches,
}: SearchHighlightPluginProps) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		const recompute = () => {
			if (!query) {
				onMatches(editorKey, 0);
				searchHighlightRegistry.clear(editorKey);
				searchHighlightRegistry.setCurrent(null);
				return;
			}

			editor.getEditorState().read(() => {
				const { text, entries } = buildOffsetMap($getRoot());
				const matches = findMatches(text, query, caseSensitive);

				const ranges: Range[] = [];
				for (const match of matches) {
					const anchor = offsetToPoint(entries, match.start);
					const focus = offsetToPoint(entries, match.end);
					if (!anchor || !focus) continue;
					const range = createDOMRange(
						editor,
						anchor.node,
						anchor.offset,
						focus.node,
						focus.offset,
					);
					if (range) ranges.push(range);
				}

				onMatches(editorKey, ranges.length);

				const currentRange =
					currentMatchLocalIndex !== null
						? (ranges[currentMatchLocalIndex] ?? null)
						: null;

				searchHighlightRegistry.setAll(editorKey, ranges);
				if (currentRange)
					searchHighlightRegistry.setCurrent(currentRange);
			});
		};

		recompute();
		const unregisterUpdate = editor.registerUpdateListener(recompute);
		return () => {
			unregisterUpdate();
		};
	}, [
		editor,
		editorKey,
		query,
		caseSensitive,
		currentMatchLocalIndex,
		onMatches,
	]);

	// Drops this editor's ranges when it unmounts, not just on query change.
	useEffect(() => {
		return () => {
			searchHighlightRegistry.clear(editorKey);
		};
	}, [editorKey]);

	return null;
}
