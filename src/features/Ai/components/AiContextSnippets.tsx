import { Group, Pill } from "@mantine/core";
import useAppSelector from "../../../hooks/useAppSelector";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { selectAiContextSnippets } from "../../../stores/aiContext/aiSelectors";
import { removeAiContextSnippet } from "../../../stores/aiContext/aiReducer";
import { previewText } from "../utils/contextSnippetPreview";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

function AiContextSnippets() {
	const snippets = useAppSelector(selectAiContextSnippets);
	const dispatch = useAppDispatch();

	if (snippets.length === 0) return null;

	return (
		<Group gap="xs" py="xs" wrap="wrap">
			{snippets.map(snippet => (
				<AppTooltip key={snippet.id} label={snippet.text} multiline>
					<Pill
						size="lg"
						withRemoveButton
						onRemove={() =>
							dispatch(removeAiContextSnippet(snippet.id))
						}
						removeButtonProps={{
							"aria-label": "Remove context",
						}}
						style={{
							background: "var(--mantine-primary-color-light)",
							color: "var(--mantine-primary-color-light-color)",
						}}>
						{previewText(snippet.text)}
					</Pill>
				</AppTooltip>
			))}
		</Group>
	);
}

export default AiContextSnippets;
