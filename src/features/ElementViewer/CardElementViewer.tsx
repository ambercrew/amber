import { useMemo } from "react";
import { Alert, Container, Divider, Group, Stack, Text } from "@mantine/core";
import { QuestionIcon, CheckCircleIcon, InfoIcon } from "@phosphor-icons/react";
import ContentOriginPanel from "./ContentOriginPanel";
import ElementEditor from "./ElementEditor";
import SearchHighlightPlugin from "../../components/Editor/plugins/SearchHighlightPlugin/SearchHighlightPlugin";
import { CardResponseDto } from "../../api/elements/dto/anyElementDto";
import { FloatingMenuItem } from "../../components/Editor/plugins/FloatingMenuPlugin";
import { HighlightCreatedPayload } from "../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import useAppSelector from "../../hooks/useAppSelector";
import {
	selectStudyCardPhase,
	selectStudySessionElement,
} from "../../stores/study/studySelectors";
import { isSameElement } from "../../utils/elementKey";
import { selectElementRefreshCount } from "../../stores/sync/syncSelector";
import { ElementId } from "../../types/elements/elementId";
import { useEditorFindInPage } from "./hooks/useEditorFindInPage";
import { useIsCardSyncedFromAnki } from "./hooks/useIsCardSyncedFromAnki";
import { useLineWidthContainerProps } from "../../hooks/useLineWidthContainerProps";

interface CardElementViewerProps {
	elementId: ElementId;
	card: CardResponseDto;
	buttons: FloatingMenuItem[];
	onFrontChange: (content: string) => Promise<void>;
	onBackChange: (content: string) => Promise<void>;
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

export default function CardElementViewer({
	elementId,
	card,
	buttons,
	onFrontChange,
	onBackChange,
	onHighlightCreated,
}: CardElementViewerProps) {
	const sessionElement = useAppSelector(selectStudySessionElement);
	const cardPhase = useAppSelector(selectStudyCardPhase);
	// Only the card being reviewed hides its answer, not one opened mid-session.
	const inReview =
		sessionElement !== null && isSameElement(sessionElement, elementId);
	const answerHidden = inReview && cardPhase === "question";
	// Remounts the editors once a sync reloads the card, as they only read their content on mount.
	const refreshCount = useAppSelector(selectElementRefreshCount);
	const fromAnki = useIsCardSyncedFromAnki(elementId.id);

	const editorKeys = useMemo(
		() => (answerHidden ? ["front"] : ["front", "back"]),
		[answerHidden],
	);
	const { query, caseSensitive, onMatches, matchIndexFor } =
		useEditorFindInPage(editorKeys);
	const containerProps = useLineWidthContainerProps();

	return (
		<Container {...containerProps} py="lg">
			<Stack key={`card-${elementId.id}-${refreshCount}`} gap="xl">
				{fromAnki && !inReview && (
					<Alert variant="light" icon={<InfoIcon />} p="xs">
						<Text size="sm">
							Imported from Anki. Edit this card in Anki: changes
							made here are replaced when its note changes there.
						</Text>
					</Alert>
				)}
				<Stack gap="md">
					<Group gap="xs">
						<QuestionIcon size={18} />
						<Text size="sm" c="dimmed" tt="uppercase">
							Front
						</Text>
					</Group>
					<ElementEditor
						initialContent={card.front}
						buttons={buttons}
						onChange={onFrontChange}
						onHighlightCreated={onHighlightCreated}>
						<SearchHighlightPlugin
							editorKey="front"
							query={query}
							caseSensitive={caseSensitive}
							currentMatchLocalIndex={matchIndexFor("front")}
							onMatches={onMatches}
						/>
					</ElementEditor>
				</Stack>
				<Divider />
				<Stack gap="md">
					<Group gap="xs">
						<CheckCircleIcon size={18} />
						<Text size="sm" c="dimmed" tt="uppercase">
							Back
						</Text>
					</Group>
					{answerHidden ? (
						<Text size="md" c="dimmed" fs="italic">
							Try to recall the answer, then reveal it here.
						</Text>
					) : (
						<ElementEditor
							initialContent={card.back}
							buttons={buttons}
							onChange={onBackChange}
							onHighlightCreated={onHighlightCreated}>
							<SearchHighlightPlugin
								editorKey="back"
								query={query}
								caseSensitive={caseSensitive}
								currentMatchLocalIndex={matchIndexFor("back")}
								onMatches={onMatches}
							/>
						</ElementEditor>
					)}
				</Stack>
			</Stack>
			<ContentOriginPanel meta={card.meta} />
		</Container>
	);
}
