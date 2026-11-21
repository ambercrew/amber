import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

interface RootElementPluginProps {
	/** Called with the editable root (or `null` on unmount / root swap). */
	onRootElement: (element: HTMLElement | null) => void;
}

/**
 * Reports the editor's root (the contenteditable holding the top-level blocks), so callers read block
 * geometry through Lexical; fires at once, on every change, and with `null` on unmount.
 */
export default function RootElementPlugin({
	onRootElement,
}: RootElementPluginProps) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		const unregister = editor.registerRootListener(root =>
			onRootElement(root),
		);
		return () => {
			unregister();
			onRootElement(null);
		};
	}, [editor, onRootElement]);
	return null;
}
