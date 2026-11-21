import { Button, Group } from "@mantine/core";
import { $getRoot, LexicalEditor } from "lexical";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { requestFocus } from "../../../hooks/useFocusRequest";
import {
	addAiContextSnippet,
	requestAiPrompt,
} from "../../../stores/aiContext/aiContextReducer";
import { selectSettings } from "../../../stores/settings/settingsSelectors";
import { CONVERT_EXTRACT_TO_CARDS_PROMPT } from "../../Ai/utils/aiPrompts";
import { AI_CARDS_BUTTON } from "../utils/highlightFloatingMenuButtons";

interface ExtractAiCardsButtonProps {
	editorRef: React.RefObject<LexicalEditor | null>;
}

/** Asks the AI to turn the whole extract into cards and then finish it. */
export default function ExtractAiCardsButton({
	editorRef,
}: ExtractAiCardsButtonProps) {
	const dispatch = useAppDispatch();
	const aiEnabled = useAppSelector(selectSettings)?.enableAi ?? false;

	if (!aiEnabled) return null;

	const handleClick = () => {
		// Read the live editor so edits not yet auto-saved are included.
		const text = editorRef.current
			?.getEditorState()
			.read(() => $getRoot().getTextContent())
			.trim();
		if (!text) return;
		dispatch(addAiContextSnippet(text));
		dispatch(requestAiPrompt(CONVERT_EXTRACT_TO_CARDS_PROMPT));
		dispatch(requestFocus("aiChat"));
	};

	const { Icon } = AI_CARDS_BUTTON;

	return (
		<Group justify="flex-end" mb="sm">
			<AppTooltip label="Ask the AI to turn this extract into cards, then finish it">
				<Button
					variant="default"
					size="sm"
					leftSection={<Icon size={16} />}
					onClick={handleClick}>
					{AI_CARDS_BUTTON.title}
				</Button>
			</AppTooltip>
		</Group>
	);
}
