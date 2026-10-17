import {
	Box,
	Collapse,
	Group,
	Loader,
	Paper,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { createElement } from "react";
import {
	CardsIcon,
	CaretDownIcon,
	CaretRightIcon,
	CheckIcon,
	CheckSquareIcon,
	FileIcon,
	Icon,
	MagnifyingGlassIcon,
	PaperclipIcon,
} from "@phosphor-icons/react";
import { MessageContentDto } from "../../../api/aiIntegration/dto/messageDto";
import { DisplayMessage } from "../utils/buildDisplayMessages";
import AiMarkdown from "./AiMarkdown";
import ToolApprovalCard, { OnToolApprovalResolved } from "./ToolApprovalCard";

interface MessageBubbleProps {
	id: string;
	content: MessageContentDto;
	/** Name of the tool a `toolCall`/`toolResult` bubble belongs to. */
	toolName?: string;
	/** Whether this is the assistant reply currently being streamed in. */
	isStreaming?: boolean;
	/** Text snippets the user selected as additional context, for `human` messages. */
	contextSnippets?: string[];
	approval?: DisplayMessage["approval"];
	onToolApprovalResolved?: OnToolApprovalResolved;
}

const TOOL_ICONS: Record<string, Icon> = {
	search_documents: PaperclipIcon,
	create_card: CardsIcon,
	finish_extract: CheckSquareIcon,
};

function toolLabel(toolName: string | undefined, done: boolean): string {
	const readable = toolName?.replace(/_/g, " ") ?? "tool";
	return done ? `Ran ${readable}` : `Running ${readable}…`;
}

function toolIcon(toolName: string | undefined, done: boolean) {
	const Component = done
		? CheckIcon
		: ((toolName ? TOOL_ICONS[toolName] : null) ?? MagnifyingGlassIcon);
	return createElement(Component, { size: 12 });
}

function ContextSnippets({ id, snippets }: { id: string; snippets: string[] }) {
	const [opened, setOpened] = useLocalStorage({
		key: `ai-message.${id}.context-snippets-opened`,
		defaultValue: false,
	});
	const toggle = () => setOpened(o => !o);

	return (
		<Box
			p="xs"
			style={{
				borderRadius: "var(--mantine-radius-sm)",
				background: "rgba(0, 0, 0, 0.18)",
			}}>
			<UnstyledButton onClick={toggle}>
				<Group gap="xs">
					{opened ? (
						<CaretDownIcon size={16} />
					) : (
						<CaretRightIcon size={16} />
					)}
					<Text size="sm">
						{snippets.length === 1
							? "1 snippet"
							: `${snippets.length} snippets`}
					</Text>
				</Group>
			</UnstyledButton>
			<Collapse expanded={opened} keepMounted={false}>
				<Stack gap="xs" mt="xs">
					{snippets.map((snippet, index) => (
						<Box key={index}>
							<Text fw={700}>Snippet {index + 1}</Text>
							<Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
								{snippet}
							</Text>
						</Box>
					))}
				</Stack>
			</Collapse>
		</Box>
	);
}

function MessageBubble({
	id,
	content,
	toolName,
	isStreaming,
	contextSnippets,
	approval,
	onToolApprovalResolved,
}: MessageBubbleProps) {
	if (content.type === "human") {
		return (
			<Group justify="flex-end">
				<Paper
					withBorder
					radius="md"
					p="sm"
					maw="90%"
					bg="var(--mantine-primary-color-filled)"
					c="var(--mantine-primary-color-contrast)">
					<Stack gap="xs">
						{contextSnippets && contextSnippets.length > 0 && (
							<ContextSnippets
								id={id}
								snippets={contextSnippets}
							/>
						)}
						<Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
							{content.value}
						</Text>
					</Stack>
				</Paper>
			</Group>
		);
	}

	if (content.type === "assistant") {
		if (content.value === "") {
			return (
				<Group justify="flex-start">
					<Paper withBorder radius="md" p="sm">
						<Loader type="dots" size="sm" />
					</Paper>
				</Group>
			);
		}

		return (
			<Group justify="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
				<Paper
					withBorder
					radius="md"
					p="sm"
					maw="90%"
					style={{ minWidth: 0 }}>
					<AiMarkdown markdown={content.value} />
					{isStreaming && (
						<Group justify="flex-end" mt={4}>
							<Loader type="dots" size="xs" />
						</Group>
					)}
				</Paper>
			</Group>
		);
	}

	if (content.type === "document") {
		return (
			<Group justify="flex-end">
				<Paper withBorder radius="md" p="xs" maw="90%">
					<Group gap="xs" wrap="nowrap">
						{isStreaming ? (
							<Loader size={16} />
						) : (
							<FileIcon size={16} />
						)}
						<Text size="xs" truncate>
							{content.value.fileName}
						</Text>
					</Group>
				</Paper>
			</Group>
		);
	}

	if (content.type === "toolCall" && approval) {
		return (
			<ToolApprovalCard
				messageId={approval.messageId}
				toolCall={content.value}
				status={approval.status}
				markdown={approval.markdown}
				resultMarkdown={approval.resultMarkdown}
				onResolved={onToolApprovalResolved}
			/>
		);
	}

	const done = content.type === "toolResult";
	const name = content.type === "toolCall" ? content.value.name : toolName;

	return (
		<Box>
			<Group gap={4} wrap="nowrap">
				{toolIcon(name, done)}
				<Text size="xs" c="dimmed" fs="italic">
					{toolLabel(name, done)}
				</Text>
			</Group>
		</Box>
	);
}

export default MessageBubble;
