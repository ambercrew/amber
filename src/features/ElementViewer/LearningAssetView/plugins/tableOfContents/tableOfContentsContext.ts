import { createContext, use } from "react";
import { LearningAssetHeadingDto } from "../../../../../types/elements/learningAssetHeadingDto";

interface TableOfContentsContextValue {
	/** Reports a mounted split's headings from its live editor, replacing the stored ones. */
	onSplitHeadings: (seq: number, headings: LearningAssetHeadingDto[]) => void;
}

export const TableOfContentsContext =
	createContext<TableOfContentsContextValue | null>(null);

export function useTableOfContentsContext(): TableOfContentsContextValue {
	const value = use(TableOfContentsContext);
	if (!value)
		throw new Error(
			"useTableOfContentsContext must be used inside TableOfContentsProvider",
		);
	return value;
}
