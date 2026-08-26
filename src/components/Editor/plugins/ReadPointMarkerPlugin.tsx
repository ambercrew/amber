import { useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNearestNodeFromDOMNode, NodeKey } from "lexical";
import { Box } from "@mantine/core";
import { commandIcon } from "../../../commands/commandIcon";
import AppTooltip from "../../AppTooltip/AppTooltip";

interface ReadPointMarkerPluginProps {
	/** Index of the block (among the editor root's children) to mark. */
	blockIndex: number;
}

/**
 * Marks the reader's saved position beside a block in this split. Positioned
 * against the editor's own `position: relative` anchor (`root.parentElement`,
 * see `Editor.module.css`'s `.anchor`), so it needs no coordinates from
 * outside this editor instance — it re-measures on every editor update
 * (edits, reflow within this split) and on window resize.
 *
 * `blockIndex` only locates the block the first time it's seen; after that
 * the block's own Lexical node key is used, so the marker stays on that
 * exact block even if edits above it shift its index. When `blockIndex`
 * itself changes (the caller moved the marker to a different block), the
 * cached key is dropped so the new index is looked up fresh.
 */
export default function ReadPointMarkerPlugin({
	blockIndex,
}: ReadPointMarkerPluginProps) {
	const [editor] = useLexicalComposerContext();
	const [top, setTop] = useState<number | null>(null);
	const blockKeyRef = useRef<NodeKey | null>(null);

	useEffect(() => {
		blockKeyRef.current = null;
	}, [blockIndex]);

	useEffect(() => {
		const measure = () => {
			const root = editor.getRootElement();
			const anchor = root?.parentElement;
			if (!root || !anchor) return;

			let block: HTMLElement | null = blockKeyRef.current
				? editor.getElementByKey(blockKeyRef.current)
				: null;

			if (!block) {
				block =
					(root.children[blockIndex] as HTMLElement | undefined) ??
					(root.children[root.children.length - 1] as
						HTMLElement | undefined) ??
					null;
				if (block) {
					const foundBlock = block;
					editor.getEditorState().read(
						() => {
							const node = $getNearestNodeFromDOMNode(foundBlock);
							if (node) blockKeyRef.current = node.getKey();
						},
						{ editor },
					);
				}
			}

			if (!block) return;
			setTop(
				block.getBoundingClientRect().top -
					anchor.getBoundingClientRect().top,
			);
		};

		// Deferred a frame: right on mount, the block just swapped in from a
		// placeholder and hasn't painted real geometry yet, so measuring
		// synchronously here would place the marker at a stale position.
		const raf = requestAnimationFrame(measure);
		const unregisterUpdate = editor.registerUpdateListener(measure);
		window.addEventListener("resize", measure);
		return () => {
			cancelAnimationFrame(raf);
			unregisterUpdate();
			window.removeEventListener("resize", measure);
		};
	}, [editor, blockIndex]);

	if (top === null) return null;

	return (
		<AppTooltip
			label="You'll resume here next time"
			position="left"
			withArrow>
			<Box pos="absolute" top={top} right="100%" mr={5} fz={22}>
				{commandIcon("set-read-point")}
			</Box>
		</AppTooltip>
	);
}
