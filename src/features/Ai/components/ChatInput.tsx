import { KeyboardEvent, useState } from "react";
import { ActionIcon, Group, Textarea } from "@mantine/core";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

interface ChatInputProps {
	disabled?: boolean;
	isStreaming: boolean;
	isUploading?: boolean;
	onSend: (prompt: string) => void;
	onStop: () => void;
	onUpload: (path: string) => void;
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
	initialValue,
}: ChatInputProps) {
	const [value, setValue] = useState(initialValue ?? "");

	function handleSend() {
		const trimmed = value.trim();
		if (!trimmed || isStreaming) return;
		onSend(trimmed);
		setValue("");
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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
					disabled={disabled || isUploading}
					loading={isUploading}
					onClick={() => void handleUploadClick()}
					aria-label="Upload document">
					<PaperclipIcon size={18} />
				</ActionIcon>
			</AppTooltip>

			<Textarea
				style={{ flex: 1 }}
				placeholder="Ask a question…"
				autosize
				minRows={1}
				maxRows={6}
				value={value}
				disabled={disabled}
				onChange={e => setValue(e.currentTarget.value)}
				onKeyDown={handleKeyDown}
			/>

			{isStreaming ? (
				<ActionIcon
					variant="filled"
					color="red"
					size="lg"
					onClick={onStop}
					aria-label="Stop generation">
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
