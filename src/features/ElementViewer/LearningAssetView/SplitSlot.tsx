import { useCallback, useEffect, useRef, useState } from "react";
import { Divider } from "@mantine/core";
import {
	getLearningAssetSplitContent,
	updateLearningAsset,
} from "../../../api/elements/api/elementsApi";
import CursorTrackerPlugin from "../../../components/Editor/plugins/CursorTrackerPlugin";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import ElementEditor from "../ElementEditor";
import { blockIndexOf } from "./core/blockIndexOf";
import { SplitContext, useReaderCore } from "./core/readerCoreContext";
import { useSplitStackWiring } from "./core/splitStackContext";
import { PluginParts } from "./plugins/PluginHost";
import { LearningAssetPlugin } from "./plugins/types";
import SplitPlaceholder from "./SplitPlaceholder";

interface SplitSlotProps {
	split: LearningAssetSplitMetaDto;
	/** Position in the stack, from 0. */
	index: number;
	buttons: FloatingMenuItem[];
	plugins: LearningAssetPlugin[];
}

/**
 * One split in the learning asset stack: a live editor when mounted, a cheap
 * placeholder otherwise. Renders a labeled divider at its top edge (every
 * split except the first) so the seam between Lexical instances is legible.
 */
export default function SplitSlot({
	split,
	index,
	buttons,
	plugins,
}: SplitSlotProps) {
	const { seq, charCount } = split;
	const { learningAssetId, mountedSeqs, getHeight, anchors } =
		useReaderCore();
	const {
		slotRef,
		observeSplit,
		contentRootRef: contentRootRefFor,
		splitBoxRef,
		notifyContentReady,
		onHighlightCreated,
	} = useSplitStackWiring();
	const mounted = mountedSeqs.has(seq);
	const registerContentRoot = contentRootRefFor(seq);
	const observeContent = observeSplit(seq, charCount);
	const registerSplitBox = splitBoxRef(seq);

	const [content, setContent] = useState<string | null>(null);
	const contentRootRef = useRef<HTMLElement | null>(null);

	const handleRootElement = useCallback(
		(element: HTMLElement | null) => {
			contentRootRef.current = element;
			registerContentRoot(element);
		},
		[registerContentRoot],
	);

	// Fetches once, the first time this slot enters the mount window. Later
	// re-mounts reuse it, so `handleChange` keeps it current with local edits.
	useEffect(() => {
		if (!mounted || content !== null) return;
		let cancelled = false;
		void getLearningAssetSplitContent({ learningAssetId, seq })
			.then(loaded => {
				if (!cancelled) setContent(loaded);
			})
			.catch(() => {
				if (!cancelled) setContent("");
			});
		return () => {
			cancelled = true;
		};
	}, [mounted, learningAssetId, seq, content]);

	useEffect(() => {
		if (mounted && content !== null) notifyContentReady(seq);
	}, [mounted, content, seq, notifyContentReady]);

	const { trackCursor, setMenuAnchor } = anchors;
	const handleCursorMove = useCallback(
		(blockIndex: number) => trackCursor(seq, blockIndex),
		[trackCursor, seq],
	);

	// A right-click doesn't always move the caret, but the menu's "set here" actions mean the clicked block.
	const handleContextMenuCapture = useCallback(
		(event: React.MouseEvent) => {
			const root = contentRootRef.current;
			const block = root && blockIndexOf(root, event.target as Node);
			setMenuAnchor(
				block === null || block === undefined
					? null
					: { split: seq, block },
			);
		},
		[setMenuAnchor, seq],
	);
	const handleContextMenuClose = useCallback(
		() => setMenuAnchor(null),
		[setMenuAnchor],
	);

	const handleChange = useCallback(
		async (updated: string) => {
			// Without this, scrolling back re-mounts the editor with pre-edit content.
			setContent(updated);
			await updateLearningAsset({
				splitId: { learningAssetId, seq },
				content: updated,
			});
		},
		[learningAssetId, seq],
	);

	// Measure only the content box, not the divider above it, so its height
	// isn't double-counted when reused for the placeholder.
	const setContentElement = useCallback(
		(element: HTMLDivElement | null) => {
			registerSplitBox(element);
			observeContent(mounted ? element : null);
		},
		[registerSplitBox, observeContent, mounted],
	);

	const showPlaceholder = !mounted || content === null;

	return (
		<div ref={slotRef(seq)}>
			{index > 0 && <Divider label={`Split ${index + 1}`} my="lg" />}
			<div
				ref={setContentElement}
				onContextMenuCapture={handleContextMenuCapture}>
				{showPlaceholder ? (
					<SplitPlaceholder height={getHeight(seq, charCount)} />
				) : (
					<ElementEditor
						initialContent={content}
						buttons={buttons}
						onChange={handleChange}
						onHighlightCreated={onHighlightCreated}
						onRootElement={handleRootElement}
						contextMenuItems={
							<PluginParts
								plugins={plugins}
								part="ContextMenuItems"
							/>
						}
						onContextMenuClose={handleContextMenuClose}>
						<CursorTrackerPlugin onCursorMove={handleCursorMove} />
						<SplitContext value={seq}>
							<PluginParts plugins={plugins} part="SplitPlugin" />
						</SplitContext>
					</ElementEditor>
				)}
			</div>
		</div>
	);
}
