import SearchHighlightPlugin from "../../../../../components/Editor/plugins/SearchHighlightPlugin/SearchHighlightPlugin";
import { useSplit } from "../../core/readerCoreContext";
import { useSearchContext } from "./searchContext";

/** Highlights this split's matches, and the current one if it's here. */
export default function SearchSplitPlugin() {
	const seq = useSplit();
	const { query, caseSensitive, currentTarget, onSplitMatches } =
		useSearchContext();
	return (
		<SearchHighlightPlugin
			editorKey={String(seq)}
			query={query}
			caseSensitive={caseSensitive}
			currentMatchLocalIndex={
				currentTarget?.seq === seq ? currentTarget.localIndex : null
			}
			onMatches={onSplitMatches}
		/>
	);
}
