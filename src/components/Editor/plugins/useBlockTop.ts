import { useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNearestNodeFromDOMNode, NodeKey } from "lexical";

/** Top (px) of the root's `blockIndex`th block relative to the editor's anchor (`root.parentElement`), or `null` until measured.
 * Follows that block by node key after the first lookup, so edits above it don't move the result; re-measures on updates and resizes. */
export function useBlockTop(blockIndex: number): number | null {
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

		// Deferred a frame: a block just swapped in from a placeholder hasn't painted its real geometry yet.
		const raf = requestAnimationFrame(measure);
		const unregisterUpdate = editor.registerUpdateListener(measure);
		const root = editor.getRootElement();
		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(measure);
		if (root) resizeObserver?.observe(root);
		return () => {
			cancelAnimationFrame(raf);
			unregisterUpdate();
			resizeObserver?.disconnect();
		};
	}, [editor, blockIndex]);

	return top;
}
