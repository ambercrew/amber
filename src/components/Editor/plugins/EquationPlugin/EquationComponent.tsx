import { renderToString } from "katex";
import "katex/dist/katex.min.css";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";
import {
	$getNodeByKey,
	$getSelection,
	$isNodeSelection,
	COMMAND_PRIORITY_LOW,
	KEY_ENTER_COMMAND,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mantine/core";
import AutosizeTextInput from "../../../AutosizeTextInput/AutosizeTextInput";
import { $isEquationNode } from "./EquationNode";

interface Props {
	equation: string;
	display?: boolean;
	nodeKey: string;
}

/**
 * Whether the node is the entire selection. A node that is merely part of a
 * wider selection is not treated as the caret's position, so it neither shows
 * as selected nor claims Enter.
 */
function $isSoleSelection(nodeKey: string): boolean {
	const selection = $getSelection();
	if (!$isNodeSelection(selection)) return false;
	const nodes = selection.getNodes();
	return nodes.length === 1 && nodes[0].getKey() === nodeKey;
}

export default function EquationComponent({
	equation,
	display = false,
	nodeKey,
}: Props) {
	const [editor] = useLexicalComposerContext();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(equation);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	// Set when editing ends via the keyboard, so the editor is refocused once
	// the field is gone.
	const refocusRef = useRef(false);
	const [, setSelected] = useLexicalNodeSelection(nodeKey);
	const [isSoleSelection, setIsSoleSelection] = useState(false);

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
			return;
		}
		if (!refocusRef.current) return;
		refocusRef.current = false;
		editor.getRootElement()?.focus({ preventScroll: true });
		setSelected(true);
	}, [editing, editor, setSelected]);

	useEffect(() => {
		const read = () =>
			setIsSoleSelection(
				editor.getEditorState().read(() => $isSoleSelection(nodeKey)),
			);
		read();
		return editor.registerUpdateListener(read);
	}, [editor, nodeKey]);

	const startEditing = useCallback(() => {
		setDraft(equation);
		setEditing(true);
	}, [equation]);

	useEffect(() => {
		return mergeRegister(
			editor.registerCommand(
				KEY_ENTER_COMMAND,
				event => {
					if (editing || !$isSoleSelection(nodeKey)) return false;
					event?.preventDefault();
					startEditing();
					return true;
				},
				COMMAND_PRIORITY_LOW,
			),
		);
	}, [editor, editing, startEditing, nodeKey]);

	const html = useMemo(() => {
		try {
			return renderToString(equation, {
				displayMode: display,
				throwOnError: false,
				output: "html",
			});
		} catch {
			return equation;
		}
	}, [equation, display]);

	/**
	 * Leaves the equation selected and focused once the field unmounts, so
	 * arrow keys and Enter keep working.
	 */
	function stopEditing() {
		refocusRef.current = true;
		setEditing(false);
	}

	function commit(value: string, keepSelected: boolean) {
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
		if (removed || !keepSelected) {
			setEditing(false);
			return;
		}
		stopEditing();
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
			setDraft(equation);
			stopEditing();
		}
	}

	if (editing) {
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

	return (
		<Box
			component="span"
			onDoubleClick={startEditing}
			style={{
				cursor: "pointer",
				display: display ? "block" : "inline-block",
				maxWidth: "100%",
				// KaTeX's invisible struts overflow by a few px; the padding
				// absorbs them and the negative margin keeps the line height.
				overflowX: "auto",
				overflowY: "hidden",
				padding: "0.2em 2px",
				margin: "-0.2em 0",
				verticalAlign: "top",
				borderRadius: "var(--mantine-radius-xs)",
				outline: isSoleSelection
					? "2px solid var(--mantine-primary-color-filled)"
					: undefined,
			}}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
