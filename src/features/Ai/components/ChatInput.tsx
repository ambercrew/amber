import {
	KeyboardEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	ActionIcon,
	Combobox,
	Divider,
	Group,
	ScrollArea,
	Text,
	Textarea,
	useCombobox,
} from "@mantine/core";
import { ArrowUpIcon, StopIcon } from "@phosphor-icons/react";
import { AiDocumentIcon, AiPromptLibraryIcon } from "../../../config/icons";
import { open } from "@tauri-apps/plugin-dialog";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useFocusOnRequest } from "../../../hooks/useFocusRequest";
import { matchesShortcut } from "../../../commands/useAppHotkeys";
import {
	NEXT_PROMPT_PLACEHOLDER_SHORTCUT,
	PREVIOUS_PROMPT_PLACEHOLDER_SHORTCUT,
} from "../../../config/shortcuts";
import useAiPrompts from "../hooks/useAiPrompts";
import {
	insertPrompt,
	matchPrompts,
	SlashQuery,
	slashQueryAt,
} from "../utils/promptSlashQuery";
import { adjacentPlaceholder, TextRange } from "../utils/promptPlaceholders";

/** The list's last option, which opens the prompt library instead of inserting a prompt. */
const MANAGE_PROMPTS_OPTION = "manage-prompts";

interface ChatInputProps {
	disabled?: boolean;
	isStreaming: boolean;
	isUploading?: boolean;
	onSend: (prompt: string) => void;
	onStop: () => void;
	onUpload: (path: string) => void;
	/** Opens the prompt library, offered from the `/` prompt list. */
	onManagePrompts: () => void;
	/**
	 * A prompt to pre-fill the field with, e.g. after it failed to send. Pass
	 * a changing `key` alongside this so the field remounts and picks it up.
	 */
	initialValue?: string;
}

function ChatInput({
	disabled = false,
	isStreaming,
	isUploading = false,
	onSend,
	onStop,
	onUpload,
	onManagePrompts,
	initialValue,
}: ChatInputProps) {
	const [value, setValue] = useState(initialValue ?? "");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	useFocusOnRequest("aiChat", () => textareaRef.current?.focus());

	// Autosize rounds the measured height, leaving a sub-pixel overflow that shows a scrollbar; only allow scrolling past maxRows.
	const [overflowing, setOverflowing] = useState(false);
	useLayoutEffect(() => {
		const node = textareaRef.current;
		if (node) setOverflowing(node.scrollHeight - node.clientHeight > 1);
	}, [value]);

	const {
		prompts,
		load: loadPrompts,
		errorMessage: promptsError,
	} = useAiPrompts();
	const [slash, setSlash] = useState<SlashQuery | null>(null);
	// Escape hides the list until a new `/` is typed.
	const [dismissedStart, setDismissedStart] = useState<number | null>(null);
	const pendingSelectionRef = useRef<TextRange | null>(null);

	const slashOpen = slash !== null && slash.start !== dismissedStart;
	const matches = slash ? matchPrompts(prompts, slash.query) : [];
	const combobox = useCombobox({ opened: slashOpen });

	// Loaded the first time the list opens; the store then follows edits and syncs.
	useEffect(() => {
		if (slashOpen) void loadPrompts();
	}, [slashOpen, loadPrompts]);

	const firstMatchId = matches[0]?.id;
	useEffect(() => {
		if (!slashOpen) return;
		// With no match, nothing is picked, so Enter still sends what's typed.
		if (firstMatchId) combobox.selectFirstOption();
		else combobox.resetSelectedOption();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [slashOpen, firstMatchId, slash?.query]);

	// Selects an inserted prompt's first placeholder, or puts the caret after it, once rendered.
	useLayoutEffect(() => {
		const selection = pendingSelectionRef.current;
		if (!selection) return;
		pendingSelectionRef.current = null;
		textareaRef.current?.setSelectionRange(selection.start, selection.end);
	}, [value]);

	function updateSlash(text: string, caret: number) {
		const next = slashQueryAt(text, caret);
		setSlash(next);
		if (next?.start !== dismissedStart) setDismissedStart(null);
	}

	function handleSend() {
		const trimmed = value.trim();
		if (!trimmed || isStreaming || isUploading) return;
		onSend(trimmed);
		setValue("");
		setSlash(null);
	}

	function handlePromptSubmit(id: string) {
		if (id === MANAGE_PROMPTS_OPTION) {
			setSlash(null);
			onManagePrompts();
			return;
		}
		const prompt = prompts.find(p => p.id === id);
		const caret = textareaRef.current?.selectionStart ?? value.length;
		if (!prompt || !slash) return;
		const inserted = insertPrompt(value, caret, slash, prompt.content);
		pendingSelectionRef.current = inserted.selection;
		setValue(inserted.text);
		setSlash(null);
	}

	function handleSlashKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (e.key === "ArrowDown") combobox.selectNextOption();
			else combobox.selectPreviousOption();
			return true;
		}
		const picks =
			(e.key === "Enter" && !e.shiftKey) ||
			matchesShortcut(NEXT_PROMPT_PLACEHOLDER_SHORTCUT, e.nativeEvent);
		if (picks && combobox.getSelectedOptionIndex() !== -1) {
			e.preventDefault();
			combobox.clickSelectedOption();
			return true;
		}
		if (e.key === "Escape") {
			// Keeps the Escape from closing whatever the chat sits in.
			e.preventDefault();
			e.stopPropagation();
			setDismissedStart(slash?.start ?? null);
			return true;
		}
		return false;
	}

	// Tab and Shift+Tab move between `{placeholders}`, or leave the field once past the last one.
	function selectAdjacentPlaceholder(
		e: KeyboardEvent<HTMLTextAreaElement>,
		backward: boolean,
	) {
		const textarea = e.currentTarget;
		const placeholder = adjacentPlaceholder(
			textarea.value,
			{ start: textarea.selectionStart, end: textarea.selectionEnd },
			backward,
		);
		if (!placeholder) return;
		e.preventDefault();
		textarea.setSelectionRange(placeholder.start, placeholder.end);
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (slashOpen && handleSlashKeyDown(e)) return;
		if (matchesShortcut(NEXT_PROMPT_PLACEHOLDER_SHORTCUT, e.nativeEvent)) {
			selectAdjacentPlaceholder(e, false);
			return;
		}
		if (
			matchesShortcut(PREVIOUS_PROMPT_PLACEHOLDER_SHORTCUT, e.nativeEvent)
		) {
			selectAdjacentPlaceholder(e, true);
			return;
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	async function handleUploadClick() {
		const selected = await open({
			multiple: false,
			filters: [{ name: "Documents", extensions: ["pdf", "txt", "md"] }],
		});
		if (typeof selected !== "string") return;
		onUpload(selected);
	}

	return (
		<Group align="flex-end" gap={6} pt="xs" wrap="nowrap">
			<AppTooltip label="Upload a document">
				<ActionIcon
					variant="default"
					size="lg"
					disabled={disabled || isUploading || isStreaming}
					loading={isUploading}
					onClick={() => void handleUploadClick()}
					aria-label="Upload document">
					<AiDocumentIcon size={18} />
				</ActionIcon>
			</AppTooltip>

			<Combobox
				store={combobox}
				onOptionSubmit={handlePromptSubmit}
				position="top-start">
				<Combobox.Target withKeyboardNavigation={false}>
					<Textarea
						ref={textareaRef}
						style={{ flex: 1 }}
						placeholder="Type / for a saved prompt…"
						autosize
						minRows={1}
						maxRows={6}
						styles={{
							input: {
								overflowY: overflowing ? "auto" : "hidden",
							},
						}}
						value={value}
						disabled={disabled}
						onChange={e => {
							setValue(e.currentTarget.value);
							updateSlash(
								e.currentTarget.value,
								e.currentTarget.selectionStart,
							);
						}}
						onSelect={e =>
							updateSlash(
								e.currentTarget.value,
								e.currentTarget.selectionStart,
							)
						}
						onBlur={() => setSlash(null)}
						onKeyDown={handleKeyDown}
					/>
				</Combobox.Target>

				<Combobox.Dropdown>
					<Combobox.Options>
						<ScrollArea.Autosize mah={240} type="scroll">
							{matches.map(prompt => (
								<Combobox.Option
									value={prompt.id}
									key={prompt.id}>
									<Text size="sm" fw={500} truncate>
										{prompt.name}
									</Text>
									{/* Muted from the option's own color, so it stays legible on the highlighted one. */}
									<Text
										size="xs"
										c="inherit"
										opacity={0.7}
										truncate>
										{prompt.content}
									</Text>
								</Combobox.Option>
							))}
							{matches.length === 0 && (
								<Combobox.Empty>
									{promptsError ??
										(prompts.length === 0
											? "No saved prompts yet"
											: "No prompts match")}
								</Combobox.Empty>
							)}
						</ScrollArea.Autosize>
						<Divider my={4} />
						{/* An option rather than a footer link, so the arrow keys reach it. */}
						<Combobox.Option value={MANAGE_PROMPTS_OPTION}>
							<Group gap={6} wrap="nowrap">
								<AiPromptLibraryIcon size={14} />
								<Text size="xs" c="inherit">
									Manage prompts…
								</Text>
							</Group>
						</Combobox.Option>
					</Combobox.Options>
				</Combobox.Dropdown>
			</Combobox>

			{isStreaming || isUploading ? (
				<ActionIcon
					variant="filled"
					color="red"
					size="lg"
					onClick={onStop}
					aria-label={
						isUploading ? "Stop upload" : "Stop generation"
					}>
					<StopIcon size={18} />
				</ActionIcon>
			) : (
				<ActionIcon
					variant="filled"
					size="lg"
					disabled={disabled || !value.trim()}
					onClick={handleSend}
					aria-label="Send message">
					<ArrowUpIcon size={18} />
				</ActionIcon>
			)}
		</Group>
	);
}

export default ChatInput;
