import {
	ActionIcon,
	Box,
	Collapse,
	CopyButton,
	Group,
	Loader,
	Paper,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import {
	useFocusWithin,
	useHover,
	useLocalStorage,
	useMergedRef,
} from "@mantine/hooks";
import { createElement, CSSProperties, ReactNode } from "react";
import {
	CheckIcon,
	CopyIcon,
	FileIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { AI_TOOL_ICONS, BranchAiChatIcon } from "../../../config/icons";
import { MessageContentDto } from "../../../api/aiIntegration/dto/messageDto";
import { DisplayMessage } from "../utils/buildDisplayMessages";
import AiMarkdown from "./AiMarkdown";
import ToolApprovalCard, { OnToolApprovalResolved } from "./ToolApprovalCard";
import DisclosureCaret from "../../../components/DisclosureCaret/DisclosureCaret";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useIsCoarsePointer } from "../../../hooks/useIsCoarsePointer";
import { useMotionDuration } from "../../../hooks/useMotionDuration";
import { MOTION_EASING } from "../../../config/motion";

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
	/** Copies the chat up to and including this message into a new chat; omitted while it can't be branched. */
	onBranch?: () => void;
}

function toolLabel(toolName: string | undefined, done: boolean): string {
	const readable = toolName?.replace(/_/g, " ") ?? "tool";
	return done ? `Ran ${readable}` : `Running ${readable}…`;
}

function toolIcon(toolName: string | undefined, done: boolean) {
	const Component = done
		? CheckIcon
		: ((toolName ? AI_TOOL_ICONS[toolName] : null) ?? MagnifyingGlassIcon);
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
					<DisclosureCaret opened={opened} size={16} />
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

function CopyMessageButton({ text }: { text: string }) {
	return (
		<CopyButton value={text}>
			{({ copied, copy }) => (
				<AppTooltip label={copied ? "Copied" : "Copy message"}>
					<ActionIcon
						variant="transparent"
						color="gray"
						size="sm"
						onClick={copy}
						aria-label="Copy message">
						{copied ? (
							<CheckIcon size={16} />
						) : (
							<CopyIcon size={16} />
						)}
					</ActionIcon>
				</AppTooltip>
			)}
		</CopyButton>
	);
}

interface MessageWithActionsProps {
	align: "flex-start" | "flex-end";
	text: string;
	showActions?: boolean;
	onBranch?: () => void;
	style?: CSSProperties;
	children: ReactNode;
}

// The actions show on hover or keyboard focus, and always on touch, which can't hover.
function MessageWithActions({
	align,
	text,
	showActions = true,
	onBranch,
	style,
	children,
}: MessageWithActionsProps) {
	const { hovered, ref: hoverRef } = useHover<HTMLDivElement>();
	const { focused, ref: focusRef } = useFocusWithin<HTMLDivElement>();
	const ref = useMergedRef(hoverRef, focusRef);
	const isCoarsePointer = useIsCoarsePointer();
	const duration = useMotionDuration();
	const visible = hovered || focused || isCoarsePointer;

	return (
		<Stack ref={ref} align={align} gap={2} style={style}>
			{children}
			{showActions && (
				<Group
					gap={2}
					wrap="nowrap"
					style={{
						opacity: visible ? 1 : 0,
						transition: `opacity ${duration}ms ${MOTION_EASING}`,
					}}>
					<CopyMessageButton text={text} />
					{onBranch && (
						<AppTooltip label="Branch in new chat">
							<ActionIcon
								variant="transparent"
								color="gray"
								size="sm"
								onClick={onBranch}
								aria-label="Branch in new chat">
								<BranchAiChatIcon size={16} />
							</ActionIcon>
						</AppTooltip>
					)}
				</Group>
			)}
		</Stack>
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
	onBranch,
}: MessageBubbleProps) {
	if (content.type === "human") {
		return (
			<MessageWithActions
				align="flex-end"
				text={content.value}
				onBranch={onBranch}>
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
			</MessageWithActions>
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
			<MessageWithActions
				align="flex-start"
				text={content.value}
				showActions={!isStreaming}
				onBranch={onBranch}
				style={{ minWidth: 0 }}>
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
			</MessageWithActions>
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
