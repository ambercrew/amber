import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
	$createNodeSelection,
	$getNearestNodeFromDOMNode,
	$getNodeByKey,
	$getSelection,
	$isNodeSelection,
	$setSelection,
	COMMAND_PRIORITY_LOW,
	KEY_ENTER_COMMAND,
	type NodeKey,
} from "lexical";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AutosizeTextInput from "../../../AutosizeTextInput/AutosizeTextInput";
import { $isEquationNode, equationContentOf } from "./EquationNode";

/**
 * The equation that is the entire selection. One that is merely part of a
 * wider selection is not treated as the caret's position, so it neither shows
 * as selected nor claims Enter.
 */
function $soleSelectedEquationKey(): NodeKey | null {
	const selection = $getSelection();
	if (!$isNodeSelection(selection)) return null;
	const nodes = selection.getNodes();
	return nodes.length === 1 && $isEquationNode(nodes[0])
		? nodes[0].getKey()
		: null;
}

/** Outlines the selected equation, editing it on double-click or Enter in a field portaled into just that one. */
export function EquationEditingPlugin() {
	const [editor] = useLexicalComposerContext();
	const [editingKey, setEditingKey] = useState<NodeKey | null>(null);
	// Set when editing ends via the keyboard, so the equation is refocused once the field is gone.
	const refocusKeyRef = useRef<NodeKey | null>(null);

	useEffect(() => {
		let outlined: HTMLElement | null = null;
		const outline = () => {
			const key = editor.getEditorState().read($soleSelectedEquationKey);
			const content =
				key === null
					? null
					: equationContentOf(editor.getElementByKey(key));
			if (content === outlined) return;
			if (outlined) outlined.style.outline = "";
			if (content)
				content.style.outline =
					"2px solid var(--mantine-primary-color-filled)";
			outlined = content;
		};
		outline();
		return mergeRegister(editor.registerUpdateListener(outline), () => {
			if (outlined) outlined.style.outline = "";
		});
	}, [editor]);

	useEffect(() => {
		const onDoubleClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			const key = editor.read(() => {
				const node = $getNearestNodeFromDOMNode(target);
				return $isEquationNode(node) ? node.getKey() : null;
			});
			if (key !== null) setEditingKey(key);
		};
		return mergeRegister(
			editor.registerRootListener((root, prevRoot) => {
				prevRoot?.removeEventListener("dblclick", onDoubleClick);
				root?.addEventListener("dblclick", onDoubleClick);
			}),
			editor.registerCommand(
				KEY_ENTER_COMMAND,
				event => {
					const key = $soleSelectedEquationKey();
					if (key === null) return false;
					event?.preventDefault();
					setEditingKey(key);
					return true;
				},
				COMMAND_PRIORITY_LOW,
			),
		);
	}, [editor]);

	// The field takes the rendered equation's place while it's open.
	useLayoutEffect(() => {
		if (editingKey === null) return;
		const content = equationContentOf(editor.getElementByKey(editingKey));
		if (content) content.style.display = "none";
		return () => {
			if (content) content.style.display = "";
		};
	}, [editor, editingKey]);

	useEffect(() => {
		if (editingKey !== null) return;
		const key = refocusKeyRef.current;
		if (key === null) return;
		refocusKeyRef.current = null;
		editor.getRootElement()?.focus({ preventScroll: true });
		editor.update(() => {
			if (!$getNodeByKey(key)) return;
			const selection = $createNodeSelection();
			selection.add(key);
			$setSelection(selection);
		});
	}, [editor, editingKey]);

	const element =
		editingKey === null ? null : editor.getElementByKey(editingKey);
	if (editingKey === null || !element) return null;

	return createPortal(
		<EquationField
			key={editingKey}
			nodeKey={editingKey}
			onClose={refocus => {
				if (refocus) refocusKeyRef.current = editingKey;
				setEditingKey(null);
			}}
		/>,
		element,
	);
}

interface EquationFieldProps {
	nodeKey: NodeKey;
	/** `refocus` leaves the equation selected and focused, so arrow keys and Enter keep working. */
	onClose: (refocus: boolean) => void;
}

function EquationField({ nodeKey, onClose }: EquationFieldProps) {
	const [editor] = useLexicalComposerContext();
	const [draft, setDraft] = useState(() =>
		editor.read(() => {
			const node = $getNodeByKey(nodeKey);
			return $isEquationNode(node) ? node.getEquation() : "";
		}),
	);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	// The field may still blur after it has closed (e.g. Escape), which must not commit the draft.
	const closedRef = useRef(false);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	function close(refocus: boolean) {
		closedRef.current = true;
		onClose(refocus);
	}

	function commit(value: string, keepSelected: boolean) {
		if (closedRef.current) return;
		const removed = value.trim().length === 0;
		editor.update(() => {
			const node = $getNodeByKey(nodeKey);
			if (!$isEquationNode(node)) return;
			if (removed) {
				node.remove();
				return;
			}
			node.setEquation(value);
		});
		// A removed node cannot be selected, and blurring means the user is
		// working somewhere else — don't pull the selection back here.
		close(!removed && keepSelected);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		// Keys typed in this field belong to it alone: without this the editor
		// root also sees them and, for Enter, inserts a paragraph behind the
		// field.
		e.stopPropagation();
		if (e.key === "Enter") {
			e.preventDefault();
			commit(draft, true);
		} else if (e.key === "Escape") {
			close(true);
		}
	}

	return (
		<AutosizeTextInput
			ref={inputRef}
			value={draft}
			onChange={e => setDraft(e.target.value)}
			onKeyDown={handleKeyDown}
			onBlur={() => commit(draft, false)}
			display="inline-block"
			styles={{
				input: {
					font: "inherit",
					fieldSizing: "content",
					minWidth: "4ch",
					maxWidth: "100%",
				},
			}}
		/>
	);
}
