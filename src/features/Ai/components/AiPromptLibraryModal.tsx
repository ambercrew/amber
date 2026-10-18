import { useEffect, useState } from "react";
import {
	ActionIcon,
	Alert,
	Button,
	Group,
	Paper,
	Stack,
	Text,
	Textarea,
	TextInput,
} from "@mantine/core";
import {
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import AppModal from "../../../components/AppModal/AppModal";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import ConfirmModal from "../../../components/AppModal/ConfirmModal";
import AiPromptDto from "../../../api/aiIntegration/dto/aiPromptDto";
import useAiPrompts from "../hooks/useAiPrompts";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeAiPromptLibraryModal } from "../../../stores/app/appReducer";
import {
	selectAiPromptLibraryNewPromptRequest,
	selectIsAiPromptLibraryModalOpened,
} from "../../../stores/app/appSelectors";
import { useShortcutDisplay } from "../../../commands/useShortcutDisplay";
import {
	NEXT_PROMPT_PLACEHOLDER_SHORTCUT,
	PREVIOUS_PROMPT_PLACEHOLDER_SHORTCUT,
} from "../../../config/shortcuts";

// The descriptions are full sentences, too long for Mantine's small, tight default.
const FIELD_STYLES = {
	description: {
		fontSize: "var(--mantine-font-size-sm)",
		lineHeight: "var(--mantine-line-height-sm)",
		marginBottom: 6,
	},
};

/** The prompt being written: a new one, or an edit of `id`. */
interface Draft {
	id: string | null;
	name: string;
	content: string;
}

/** Opened through `openAiPromptLibraryModal`, from the AI panel or the command palette. */
function AiPromptLibraryModal() {
	const opened = useAppSelector(selectIsAiPromptLibraryModalOpened);
	const newPromptRequest = useAppSelector(
		selectAiPromptLibraryNewPromptRequest,
	);
	const dispatch = useAppDispatch();
	const onClose = () => dispatch(closeAiPromptLibraryModal());
	const {
		prompts,
		load,
		savePrompt,
		deletePrompt,
		errorMessage,
		clearErrorMessage,
		isSendingRequest,
	} = useAiPrompts();
	const [draft, setDraft] = useState<Draft | null>(null);
	// Kept after the confirmation closes, so its text doesn't blank out while it fades.
	const [deletingPrompt, setDeletingPrompt] = useState<AiPromptDto | null>(
		null,
	);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

	const displayShortcut = useShortcutDisplay();
	const nextPlaceholderKey = displayShortcut(
		NEXT_PROMPT_PLACEHOLDER_SHORTCUT,
	);
	const previousPlaceholderKey = displayShortcut(
		PREVIOUS_PROMPT_PLACEHOLDER_SHORTCUT,
	);

	// Each request to add a prompt starts a blank one, set while rendering so it never flashes the list.
	const [seenNewPromptRequest, setSeenNewPromptRequest] =
		useState(newPromptRequest);
	if (newPromptRequest !== seenNewPromptRequest) {
		setSeenNewPromptRequest(newPromptRequest);
		setDraft({ id: null, name: "", content: "" });
	}

	useEffect(() => {
		if (opened) void load();
	}, [opened, load]);

	function startEditing(prompt: AiPromptDto | null) {
		clearErrorMessage();
		setDraft({
			id: prompt?.id ?? null,
			name: prompt?.name ?? "",
			content: prompt?.content ?? "",
		});
	}

	async function handleSave() {
		if (!draft) return;
		const dto = { name: draft.name, content: draft.content };
		if (await savePrompt(draft.id, dto)) setDraft(null);
	}

	const canSave =
		!!draft?.name.trim() && !!draft.content.trim() && !isSendingRequest;

	return (
		<>
			<AppModal
				opened={opened}
				onClose={onClose}
				title={
					draft
						? draft.id
							? "Edit prompt"
							: "New prompt"
						: "Prompt library"
				}
				size="lg"
				fullScreenOnSmallScreen
				onExitTransitionEnd={() => {
					setDraft(null);
					clearErrorMessage();
				}}>
				{errorMessage && (
					<Alert
						color="red"
						icon={<WarningIcon size={16} />}
						mb="sm"
						withCloseButton
						onClose={clearErrorMessage}>
						{errorMessage}
					</Alert>
				)}

				{draft ? (
					<Stack gap="sm">
						<TextInput
							label="Name"
							styles={FIELD_STYLES}
							description="Type / and part of the name in the chat to insert the prompt."
							placeholder="e.g. Quiz me"
							autoFocus
							value={draft.name}
							onChange={e =>
								setDraft({
									...draft,
									name: e.currentTarget.value,
								})
							}
						/>
						<Textarea
							label="Prompt"
							styles={FIELD_STYLES}
							description={`Put parts to fill in each time in braces, like {topic}. Inserting the prompt selects the first one${
								nextPlaceholderKey && previousPlaceholderKey
									? `, and ${nextPlaceholderKey} and ${previousPlaceholderKey} move between them`
									: ""
							}.`}
							placeholder="e.g. Ask me questions about {topic} one at a time, and tell me what I got wrong."
							autosize
							minRows={4}
							maxRows={12}
							value={draft.content}
							onChange={e =>
								setDraft({
									...draft,
									content: e.currentTarget.value,
								})
							}
						/>
						<Group justify="flex-end" gap="xs">
							<Button
								variant="default"
								onClick={() => setDraft(null)}>
								Cancel
							</Button>
							<Button
								disabled={!canSave}
								loading={isSendingRequest}
								onClick={() => void handleSave()}>
								Save
							</Button>
						</Group>
					</Stack>
				) : (
					<Stack gap="sm">
						<Group justify="space-between" wrap="nowrap">
							<Text size="sm" c="dimmed">
								Type / in the chat to insert one of these
								prompts.
							</Text>
							<Button
								size="xs"
								leftSection={<PlusIcon size={14} />}
								data-autofocus
								onClick={() => startEditing(null)}>
								New prompt
							</Button>
						</Group>

						{prompts.length === 0 && (
							<Text size="sm" c="dimmed" ta="center" py="lg">
								No saved prompts yet.
							</Text>
						)}

						{prompts.map(prompt => (
							<Paper key={prompt.id} withBorder p="sm">
								<Group
									justify="space-between"
									align="flex-start"
									wrap="nowrap">
									<Stack gap={2} style={{ minWidth: 0 }}>
										<Text fw={500} truncate>
											{prompt.name}
										</Text>
										<Text
											size="sm"
											c="dimmed"
											lineClamp={2}
											style={{ whiteSpace: "pre-wrap" }}>
											{prompt.content}
										</Text>
									</Stack>
									<Group gap={4} wrap="nowrap">
										<AppTooltip label="Edit prompt">
											<ActionIcon
												variant="subtle"
												aria-label={`Edit ${prompt.name}`}
												onClick={() =>
													startEditing(prompt)
												}>
												<PencilSimpleIcon size={16} />
											</ActionIcon>
										</AppTooltip>
										<AppTooltip label="Delete prompt">
											<ActionIcon
												variant="subtle"
												color="red"
												aria-label={`Delete ${prompt.name}`}
												onClick={() => {
													setDeletingPrompt(prompt);
													setIsConfirmingDelete(true);
												}}>
												<TrashIcon size={16} />
											</ActionIcon>
										</AppTooltip>
									</Group>
								</Group>
							</Paper>
						))}
					</Stack>
				)}
			</AppModal>

			<ConfirmModal
				opened={isConfirmingDelete}
				title="Delete prompt"
				confirmLabel="Delete"
				confirmColor="red"
				onConfirm={() => {
					if (deletingPrompt) void deletePrompt(deletingPrompt.id);
				}}
				onClose={() => setIsConfirmingDelete(false)}>
				<Text>
					“{deletingPrompt?.name}” will be permanently deleted from
					your prompt library. This cannot be undone.
				</Text>
			</ConfirmModal>
		</>
	);
}

export default AiPromptLibraryModal;
