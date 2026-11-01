import { useCallback } from "react";
import { Alert } from "@mantine/core";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { EditorState, LexicalEditor } from "lexical";
import Editor from "../../components/Editor/Editor";
import {
	FloatingMenuItem,
	FloatingMenuPlugin,
} from "../../components/Editor/plugins/FloatingMenuPlugin";
import { stripCodeThemes } from "../../components/Editor/plugins/CodeHighlightPlugin/CodeHighlightExtension";
import { HighlightCreatedPayload } from "../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import RootElementPlugin from "../../components/Editor/plugins/RootElementPlugin";
import useApi from "../../hooks/useApi";
import { useImageOcclusionMenuItems } from "../ImageOcclusion/hooks/useImageOcclusionMenuItems";
import { renderOcclusionOverlay } from "../ImageOcclusion/review/renderOcclusionOverlay";
import useAutoSave from "./hooks/useAutoSave";

interface ElementEditorProps {
	initialContent: string;
	buttons: FloatingMenuItem[];
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
	onChange: (content: string) => Promise<void>;
	/** Receives the editor's root element (see `RootElementPlugin`). */
	onRootElement?: (element: HTMLElement | null) => void;
	/** Extra items for the editor's right-click menu, if any. */
	contextMenuItems?: React.ReactNode;
	/** Called when the right-click menu closes. */
	onContextMenuClose?: () => void;
	/** Receives the Lexical editor, for reading its live content. */
	editorRef?: React.RefObject<LexicalEditor | null>;
	/** Extra Lexical plugins (e.g. `SearchHighlightPlugin`). */
	children?: React.ReactNode;
}

export default function ElementEditor({
	initialContent,
	buttons,
	onHighlightCreated,
	onChange,
	onRootElement,
	contextMenuItems,
	onContextMenuClose,
	editorRef,
	children,
}: ElementEditorProps) {
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	const imageMenuItems = useImageOcclusionMenuItems();
	const handleSave = useCallback(
		async (content: string) => {
			if (content === initialContent) return;
			await onChange(content);
		},
		[onChange, initialContent],
	);
	const { onContentUpdate } = useAutoSave({
		onSave: handleSave,
		callApi,
	});

	// Serializing the whole document to JSON is expensive on large
	// documents, so it is deferred to save time instead of running on
	// every editor update.
	const handleChange = useCallback(
		(editorState: EditorState) => {
			onContentUpdate(() =>
				JSON.stringify(editorState.toJSON(), stripCodeThemes),
			);
		},
		[onContentUpdate],
	);

	return (
		<>
			{errorMessage && (
				<Alert
					color="red"
					title={errorMessage}
					withCloseButton
					onClose={clearErrorMessage}
					mb="sm"
				/>
			)}
			<Editor
				initialContent={initialContent}
				onHighlightCreated={onHighlightCreated}
				contextMenuItems={contextMenuItems}
				onContextMenuClose={onContextMenuClose}
				imageMenuItems={imageMenuItems}
				renderOcclusionOverlay={renderOcclusionOverlay}>
				<FloatingMenuPlugin buttons={buttons} />
				{editorRef && <EditorRefPlugin editorRef={editorRef} />}
				<OnChangePlugin
					onChange={handleChange}
					ignoreSelectionChange
					ignoreHistoryMergeTagChange
				/>
				{onRootElement && (
					<RootElementPlugin onRootElement={onRootElement} />
				)}
				{children}
			</Editor>
		</>
	);
}
