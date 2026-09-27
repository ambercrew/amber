import { useCallback } from "react";
import { Alert } from "@mantine/core";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { EditorState } from "lexical";
import Editor from "../../components/Editor/Editor";
import {
	FloatingMenuItem,
	FloatingMenuPlugin,
} from "../../components/Editor/plugins/FloatingMenuPlugin";
import { HighlightCreatedPayload } from "../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import RootElementPlugin from "../../components/Editor/plugins/RootElementPlugin";
import ReadPointMarkerPlugin from "../../components/Editor/plugins/ReadPointMarkerPlugin";
import CursorTrackerPlugin from "../../components/Editor/plugins/CursorTrackerPlugin";
import SearchHighlightPlugin from "../../components/Editor/plugins/SearchHighlightPlugin/SearchHighlightPlugin";
import useApi from "../../hooks/useApi";
import useAutoSave from "./hooks/useAutoSave";

export interface ElementEditorSearchProps {
	/** Unique key identifying this editor instance among any others on screen. */
	editorKey: string;
	query: string;
	caseSensitive: boolean;
	/** Local index (within this instance's own matches) of the globally-current match, or null if this instance doesn't own it. */
	currentMatchLocalIndex: number | null;
	/** Reports this instance's own match count — authoritative for it. */
	onMatches: (editorKey: string, count: number) => void;
}

interface ElementEditorProps {
	initialContent: string;
	buttons: FloatingMenuItem[];
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
	onChange: (content: string) => Promise<void>;
	/** Receives the editor's root element (see `RootElementPlugin`). */
	onRootElement?: (element: HTMLElement | null) => void;
	/** Block index to mark as the reader's saved read point, if any. */
	markerBlockIndex?: number;
	/** Receives the block index containing the caret (see `CursorTrackerPlugin`). */
	onCursorMove?: (blockIndex: number) => void;
	/** Extra items for the editor's right-click menu, if any. */
	contextMenuItems?: React.ReactNode;
	/** Find-in-page search wiring for this editor instance, if search is active here. */
	search?: ElementEditorSearchProps;
}

export default function ElementEditor({
	initialContent,
	buttons,
	onHighlightCreated,
	onChange,
	onRootElement,
	markerBlockIndex,
	onCursorMove,
	contextMenuItems,
	search,
}: ElementEditorProps) {
	const { callApi, errorMessage, clearErrorMessage } = useApi();
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
			onContentUpdate(() => JSON.stringify(editorState.toJSON()));
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
				contextMenuItems={contextMenuItems}>
				<FloatingMenuPlugin buttons={buttons} />
				<OnChangePlugin
					onChange={handleChange}
					ignoreSelectionChange
					ignoreHistoryMergeTagChange
				/>
				{onRootElement && (
					<RootElementPlugin onRootElement={onRootElement} />
				)}
				{markerBlockIndex !== undefined && (
					<ReadPointMarkerPlugin blockIndex={markerBlockIndex} />
				)}
				{onCursorMove && (
					<CursorTrackerPlugin onCursorMove={onCursorMove} />
				)}
				{search && (
					<SearchHighlightPlugin
						editorKey={search.editorKey}
						query={search.query}
						caseSensitive={search.caseSensitive}
						currentMatchLocalIndex={search.currentMatchLocalIndex}
						onMatches={search.onMatches}
					/>
				)}
			</Editor>
		</>
	);
}
