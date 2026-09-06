import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isLinkNode, LinkNode } from "@lexical/link";
import { $findMatchingParent } from "@lexical/utils";
import {
	$getNearestNodeFromDOMNode,
	CLICK_COMMAND,
	COMMAND_PRIORITY_LOW,
} from "lexical";
import { useLinkOpener } from "./linkOpenerContext";

interface LinkClickPluginProps {
	/** Reports the link the right-click landed on (or `null`), so the context menu can offer to open it. */
	onContextMenuLink?: (url: string | null) => void;
}

/**
 * The editor is always editable, so a plain click on a link must place the
 * cursor rather than navigate. Only ctrl/cmd+click opens the link, and only
 * after the user confirms the URL in a modal — it opens in the user's
 * default browser rather than navigating the webview.
 */
export function LinkClickPlugin({ onContextMenuLink }: LinkClickPluginProps) {
	const [editor] = useLexicalComposerContext();
	const { openLink } = useLinkOpener();

	useEffect(() => {
		if (!editor.hasNodes([LinkNode])) {
			throw new Error(
				"LinkClickPlugin: LinkNode not registered in editor",
			);
		}
		return editor.registerCommand(
			CLICK_COMMAND,
			event => {
				if (!event.ctrlKey && !event.metaKey) return false;
				if (!(event.target instanceof Node)) return false;

				const linkNode = $linkAtDOMNode(event.target);
				if (!linkNode) return false;

				event.preventDefault();
				openLink(linkNode.getURL());
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
	}, [editor, openLink]);

	useEffect(() => {
		if (!onContextMenuLink) return;

		const handleContextMenu = (event: MouseEvent) =>
			onContextMenuLink(
				editor.read(() =>
					event.target instanceof Node
						? ($linkAtDOMNode(event.target)?.getURL() ?? null)
						: null,
				),
			);

		return editor.registerRootListener((rootElement, prevRootElement) => {
			prevRootElement?.removeEventListener(
				"contextmenu",
				handleContextMenu,
			);
			rootElement?.addEventListener("contextmenu", handleContextMenu);
		});
	}, [editor, onContextMenuLink]);

	return null;
}

function $linkAtDOMNode(node: Node): LinkNode | null {
	const lexicalNode = $getNearestNodeFromDOMNode(node);
	return lexicalNode ? $findMatchingParent(lexicalNode, $isLinkNode) : null;
}
