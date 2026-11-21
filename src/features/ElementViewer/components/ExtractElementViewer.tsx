import { useRef } from "react";
import { useLocation } from "react-router";
import { Container } from "@mantine/core";
import { LexicalEditor } from "lexical";
import ContentOriginPanel from "./ContentOriginPanel";
import ElementEditor from "./ElementEditor";
import SearchHighlightPlugin from "../../../components/Editor/plugins/SearchHighlightPlugin/SearchHighlightPlugin";
import ExtractAiCardsButton from "./ExtractAiCardsButton";
import RevealHighlightPlugin from "../../../components/Editor/plugins/HighlightPlugin/RevealHighlightPlugin";
import { readSpotNavigationState } from "../../../types/elements/spotNavigationState";
import { ExtractResponseDto } from "../../../api/elements/dto/anyElementDto";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { HighlightCreatedPayload } from "../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { ElementId } from "../../../types/elements/elementId";
import { useEditorFindInPage } from "../hooks/useEditorFindInPage";
import { useLineWidthContainerProps } from "../../../hooks/useLineWidthContainerProps";

const EXTRACT_EDITOR_KEYS = ["extract"];

interface ExtractElementViewerProps {
	elementId: ElementId;
	extract: ExtractResponseDto;
	buttons: FloatingMenuItem[];
	onChange: (content: string) => Promise<void>;
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

export default function ExtractElementViewer({
	elementId,
	extract,
	buttons,
	onChange,
	onHighlightCreated,
}: ExtractElementViewerProps) {
	const { query, caseSensitive, onMatches, matchIndexFor } =
		useEditorFindInPage(EXTRACT_EDITOR_KEYS);
	const containerProps = useLineWidthContainerProps();
	const editorRef = useRef<LexicalEditor | null>(null);
	const location = useLocation();
	const { revealHighlightOf } = readSpotNavigationState(location.state);

	return (
		<Container {...containerProps} py="lg">
			<ExtractAiCardsButton editorRef={editorRef} />
			<ElementEditor
				key={`extract-${elementId.id}`}
				initialContent={extract.content}
				buttons={buttons}
				onChange={onChange}
				onHighlightCreated={onHighlightCreated}
				editorRef={editorRef}>
				<SearchHighlightPlugin
					editorKey="extract"
					query={query}
					caseSensitive={caseSensitive}
					currentMatchLocalIndex={matchIndexFor("extract")}
					onMatches={onMatches}
				/>
				<RevealHighlightPlugin
					highlightOf={revealHighlightOf}
					revealKey={location.key}
				/>
			</ElementEditor>
			<ContentOriginPanel meta={extract.meta} />
		</Container>
	);
}
