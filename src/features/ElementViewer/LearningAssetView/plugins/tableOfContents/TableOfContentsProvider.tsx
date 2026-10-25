import {
	PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getLearningAssetHeadings } from "../../../../../api/elements/api/elementsApi";
import { useReadingCommand } from "../../../../../commands/readingCommands";
import useAppDispatch from "../../../../../hooks/useAppDispatch";
import {
	setActiveTableOfContentsEntry,
	setTableOfContents,
} from "../../../../../stores/tableOfContents/tableOfContentsReducer";
import { LearningAssetHeadingDto } from "../../../../../types/elements/learningAssetHeadingDto";
import { landOnBlock } from "../../core/landOnBlock";
import { useReaderCore } from "../../core/readerCoreContext";
import { topVisibleBlockIndex } from "../../core/useReadingAnchors";
import { viewportTop } from "../../core/viewportTop";
import {
	findCurrentHeadingId,
	headingEntryId,
	toTableOfContents,
} from "./headingTree";
import { TableOfContentsContext } from "./tableOfContentsContext";

function groupBySeq(headings: LearningAssetHeadingDto[]) {
	const bySeq = new Map<number, LearningAssetHeadingDto[]>();
	for (const heading of headings) {
		const own = bySeq.get(heading.seq);
		if (own) own.push(heading);
		else bySeq.set(heading.seq, [heading]);
	}
	return bySeq;
}

function sameHeadings(
	a: LearningAssetHeadingDto[],
	b: LearningAssetHeadingDto[],
) {
	return (
		a.length === b.length &&
		a.every(
			(heading, i) =>
				heading.block === b[i].block &&
				heading.level === b[i].level &&
				heading.text === b[i].text,
		)
	);
}

/** Shows the learning asset's headings in the side panel's table of contents, with the current one highlighted. */
export default function TableOfContentsProvider({
	children,
}: PropsWithChildren) {
	const {
		learningAssetId,
		splits,
		scrollElement,
		primarySeq,
		getContentRoot,
		navigate,
	} = useReaderCore();
	const dispatch = useAppDispatch();

	// Every split's headings as last saved, so unmounted splits are listed too.
	const [stored, setStored] = useState<Map<
		number,
		LearningAssetHeadingDto[]
	> | null>(null);
	const storedRef = useRef(stored);
	useEffect(() => {
		storedRef.current = stored;
	}, [stored]);
	useEffect(() => {
		let cancelled = false;
		getLearningAssetHeadings(learningAssetId)
			.then(headings => {
				if (!cancelled) setStored(groupBySeq(headings));
			})
			// Without them, the table still lists the mounted splits' headings.
			.catch(() => {
				if (!cancelled) setStored(new Map());
			});
		return () => {
			cancelled = true;
		};
	}, [learningAssetId]);

	// Kept after a split unmounts, since its edits may not have reached `stored`.
	const [live, setLive] = useState<Map<number, LearningAssetHeadingDto[]>>(
		() => new Map(),
	);
	const onSplitHeadings = useCallback(
		(seq: number, headings: LearningAssetHeadingDto[]) =>
			setLive(previous =>
				// A split mounting reports what's stored; skipping it saves re-publishing the whole table.
				sameHeadings(
					previous.get(seq) ?? storedRef.current?.get(seq) ?? [],
					headings,
				)
					? previous
					: new Map(previous).set(seq, headings),
			),
		[],
	);

	const headings = useMemo(
		() =>
			stored &&
			splits.flatMap(({ seq }) => live.get(seq) ?? stored.get(seq) ?? []),
		[splits, stored, live],
	);
	const entries = useMemo(
		() => headings && toTableOfContents(headings),
		[headings],
	);

	useEffect(() => {
		dispatch(
			setTableOfContents(
				entries && { ownerId: learningAssetId, entries },
			),
		);
	}, [dispatch, entries, learningAssetId]);
	useEffect(
		() => () => {
			dispatch(setTableOfContents(null));
		},
		[dispatch],
	);

	// Measured once per frame while scrolling, and dispatched only when the heading changes.
	const activeIdRef = useRef<string | null | undefined>(undefined);
	const highlightCurrent = useCallback(() => {
		if (!headings) return;
		const root = getContentRoot(primarySeq);
		const block = root
			? topVisibleBlockIndex(root, viewportTop(scrollElement))
			: 0;
		const id = findCurrentHeadingId(headings, {
			split: primarySeq,
			block,
		});
		if (id === activeIdRef.current) return;
		activeIdRef.current = id;
		dispatch(setActiveTableOfContentsEntry(id));
	}, [headings, getContentRoot, primarySeq, scrollElement, dispatch]);
	useEffect(() => {
		highlightCurrent();
		if (!scrollElement) return;
		let frame: number | null = null;
		const handler = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				highlightCurrent();
			});
		};
		scrollElement.addEventListener("scroll", handler, { passive: true });
		return () => {
			scrollElement.removeEventListener("scroll", handler);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [scrollElement, highlightCurrent]);

	useReadingCommand(
		"go-to-table-of-contents-entry",
		useCallback(
			({ entryId }) => {
				const heading = headings?.find(
					heading => headingEntryId(heading) === entryId,
				);
				if (heading) navigate(heading.seq, landOnBlock(heading.block));
			},
			[headings, navigate],
		),
	);

	const value = useMemo(() => ({ onSplitHeadings }), [onSplitHeadings]);
	return (
		<TableOfContentsContext value={value}>
			{children}
		</TableOfContentsContext>
	);
}
