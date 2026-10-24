import { useCallback, useEffect, useMemo, useState } from "react";
import { PdfActionType, PdfBookmarkObject } from "@embedpdf/models";
import { useBookmarkCapability } from "@embedpdf/plugin-bookmark/react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { useReadingCommand } from "../../../../commands/readingCommands";
import {
	setActiveTableOfContentsEntry,
	setTableOfContents,
} from "../../../../stores/tableOfContents/tableOfContentsReducer";
import { TableOfContentsEntry } from "../../../../types/elements/tableOfContentsEntry";
import { GoToPage } from "../core/usePdfNavigator";

interface OutlineItem {
	/** The bookmark's index path, e.g. "0.2.1"; unique and stable for the document. */
	id: string;
	pageIndex: number | undefined;
}

function getBookmarkPageIndex(bookmark: PdfBookmarkObject): number | undefined {
	const target = bookmark.target;
	if (!target) return undefined;
	if (target.type === "destination") return target.destination.pageIndex;
	if (target.type === "action" && target.action.type === PdfActionType.Goto) {
		return target.action.destination.pageIndex;
	}
	return undefined;
}

/** The table of contents for the bookmarks, and each entry's page in document order. */
export function toTableOfContents(
	bookmarks: PdfBookmarkObject[],
	parentId?: string,
): { entries: TableOfContentsEntry[]; items: OutlineItem[] } {
	const items: OutlineItem[] = [];
	const entries = bookmarks.map((bookmark, index) => {
		const id = parentId === undefined ? `${index}` : `${parentId}.${index}`;
		const pageIndex = getBookmarkPageIndex(bookmark);
		items.push({ id, pageIndex });
		const children = bookmark.children?.length
			? toTableOfContents(bookmark.children, id)
			: undefined;
		if (children) items.push(...children.items);
		return {
			id,
			title: bookmark.title,
			selectable: pageIndex !== undefined,
			children: children?.entries,
		};
	});
	return { entries, items };
}

/** The entry the page is in: the latest-starting one at or before it, the deepest on a tie. */
export function findCurrentEntryId(
	items: OutlineItem[],
	pageIndex: number,
): string | null {
	let current: { id: string; start: number; depth: number } | null = null;
	for (const { id, pageIndex: start } of items) {
		if (start === undefined || start > pageIndex) continue;
		const depth = id.split(".").length;
		if (
			!current ||
			start > current.start ||
			(start === current.start && depth >= current.depth)
		)
			current = { id, start, depth };
	}
	return current?.id ?? null;
}

/** Shows the PDF's bookmarks in the side panel's table of contents, with the current one highlighted. */
export function usePdfOutline(
	learningAssetId: string,
	documentId: string,
	goToPage: GoToPage,
) {
	const dispatch = useAppDispatch();
	const { provides: bookmark } = useBookmarkCapability();
	const { provides: scroll } = useScrollCapability();
	const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[] | null>(
		null,
	);

	useEffect(() => {
		if (!bookmark) return;
		let cancelled = false;
		bookmark
			.forDocument(documentId)
			.getBookmarks()
			.toPromise()
			.then(result => {
				if (!cancelled) setBookmarks(result.bookmarks);
			})
			.catch(() => {
				if (!cancelled) setBookmarks([]);
			});
		return () => {
			cancelled = true;
		};
	}, [bookmark, documentId]);

	const outline = useMemo(
		() => bookmarks && toTableOfContents(bookmarks),
		[bookmarks],
	);

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

	// Followed outside React state, so a page change re-renders nothing unless it crosses into another entry.
	useEffect(() => {
		if (!scroll || !outline) return;
		// Dispatched only when crossing into another entry, not on every page scrolled past.
		let shown: string | null | undefined;
		const highlight = (pageNumber: number) => {
			const id = findCurrentEntryId(outline.items, pageNumber - 1);
			if (id === shown) return;
			shown = id;
			dispatch(setActiveTableOfContentsEntry(id));
		};
		highlight(scroll.forDocument(documentId).getCurrentPage());
		return scroll.onPageChange(event => {
			if (event.documentId === documentId) highlight(event.pageNumber);
		});
	}, [scroll, documentId, outline, dispatch]);

	useReadingCommand(
		"go-to-table-of-contents-entry",
		useCallback(
			({ entryId }) => {
				const pageIndex = outline?.items.find(
					item => item.id === entryId,
				)?.pageIndex;
				if (pageIndex !== undefined)
					goToPage(pageIndex + 1, { behavior: "instant" });
			},
			[outline, goToPage],
		),
	);
}
