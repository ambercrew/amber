import { useCallback, useEffect, useMemo } from "react";
import { useDocuments } from "@embedpdf/react/runtime";
import { OutlineItem, useOutlineState } from "@embedpdf/react/outline";
import { StageCapability, useStage } from "@embedpdf/react/stage";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { useReadingCommand } from "../../../../commands/readingCommands";
import {
	setActiveTableOfContentsEntry,
	setTableOfContents,
} from "../../../../stores/tableOfContents/tableOfContentsReducer";
import { TableOfContentsEntry } from "../../../../types/elements/tableOfContentsEntry";
import { usePdfCore } from "../core/pdfCoreContext";

type PageDestination = Parameters<StageCapability["goToDestination"]>[0];

interface OutlineEntryTarget {
	/** The item's index path, e.g. "0.2.1"; unique and stable for the document. */
	id: string;
	pageIndex: number | undefined;
	/** Where on its page the entry starts, when its destination says. */
	landing: PageDestination | null;
}

/**
 * The spot a destination points at, without its zoom or x, so following it keeps the reader's view;
 * `null` when it only names the page. The outline counts an entry as current from this spot on.
 */
export function landingOf(
	destination: PageDestination,
): PageDestination | null {
	if (!("y" in destination) || destination.y === null) return null;
	return {
		kind: "xyz",
		page: destination.page,
		x: null,
		y: destination.y,
		zoom: null,
	};
}

/** The table of contents for the outline's items, which the plugin lists depth first; with each entry's page, and each item's entry id. */
export function toTableOfContents(
	items: readonly OutlineItem[],
	pageIndexOf: (item: OutlineItem) => number | undefined,
): {
	entries: TableOfContentsEntry[];
	targets: OutlineEntryTarget[];
	idsByObjectNumber: Map<number, string>;
} {
	const entries: TableOfContentsEntry[] = [];
	const targets: OutlineEntryTarget[] = [];
	const idsByObjectNumber = new Map<number, string>();
	const entriesByObjectNumber = new Map<number, TableOfContentsEntry>();

	for (const item of items) {
		// A parent comes before its children; one that couldn't be read leaves them at the top level.
		const parent = item.parent
			? entriesByObjectNumber.get(item.parent.objectNumber)
			: undefined;
		const siblings = parent ? (parent.children ??= []) : entries;
		const id = parent
			? `${parent.id}.${siblings.length}`
			: `${siblings.length}`;
		const pageIndex = pageIndexOf(item);
		const entry: TableOfContentsEntry = {
			id,
			title: item.title,
			selectable: pageIndex !== undefined,
		};
		siblings.push(entry);
		entriesByObjectNumber.set(item.ref.objectNumber, entry);
		idsByObjectNumber.set(item.ref.objectNumber, id);
		const target = item.target;
		targets.push({
			id,
			pageIndex,
			landing:
				pageIndex === undefined || target?.kind !== "goto"
					? null
					: landingOf(target.destination),
		});
	}
	return { entries, targets, idsByObjectNumber };
}

/** Shows the PDF's outline in the side panel's table of contents, with the current entry highlighted. */
export function usePdfOutline() {
	const { learningAssetId, goToPage, announceJump } = usePdfCore();
	const stage = useStage();
	const dispatch = useAppDispatch();
	const documents = useDocuments();
	const items = useOutlineState(state => state.items);
	const status = useOutlineState(state => state.status);
	const current = useOutlineState(state => state.current);

	const outline = useMemo(() => {
		// Nothing until the read lands, so the panel doesn't flash "no contents".
		if (status !== "ready" && status !== "forbidden" && status !== "error")
			return null;
		return toTableOfContents(items, item => {
			const target = item.target;
			if (target?.kind !== "goto") return undefined;
			const pageIndex = documents.getPageIndex(target.destination.page);
			return pageIndex >= 0 ? pageIndex : undefined;
		});
	}, [items, status, documents]);

	useEffect(() => {
		dispatch(
			setTableOfContents(
				outline && {
					ownerId: learningAssetId,
					entries: outline.entries,
				},
			),
		);
	}, [dispatch, outline, learningAssetId]);
	useEffect(
		() => () => {
			dispatch(setTableOfContents(null));
		},
		[dispatch],
	);

	const currentId =
		(current && outline?.idsByObjectNumber.get(current.objectNumber)) ??
		null;
	useEffect(() => {
		if (outline) dispatch(setActiveTableOfContentsEntry(currentId));
	}, [dispatch, outline, currentId]);

	useReadingCommand(
		"go-to-table-of-contents-entry",
		useCallback(
			({ entryId }) => {
				const target = outline?.targets.find(
					({ id }) => id === entryId,
				);
				if (target?.pageIndex === undefined) return;
				// Lands on the entry's own spot, not its page's top, so the outline counts it as current.
				if (target.landing) {
					stage.goToDestination(target.landing, {
						behavior: "instant",
					});
					announceJump();
				} else goToPage(target.pageIndex + 1, { behavior: "instant" });
			},
			[outline, goToPage, stage, announceJump],
		),
	);
}
