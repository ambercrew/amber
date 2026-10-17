import { useEffect } from "react";
import { Center, ScrollArea, Stack, Text } from "@mantine/core";
import { useStickToBottom } from "use-stick-to-bottom";
import { DisplayMessage } from "../utils/buildDisplayMessages";
import MessageBubble from "./MessageBubble";
import { OnToolApprovalResolved } from "./ToolApprovalCard";

interface ChatMessagesProps {
	chatId: string | null;
	messages: DisplayMessage[];
	onToolApprovalResolved?: OnToolApprovalResolved;
}

function ChatMessages({
	chatId,
	messages,
	onToolApprovalResolved,
}: ChatMessagesProps) {
	const { scrollRef, contentRef, scrollToBottom } = useStickToBottom({
		initial: "instant",
		resize: "instant",
	});

	// Switching chats always jumps to the bottom, even if the previous chat
	// had been scrolled up and left un-pinned.
	useEffect(() => {
		void scrollToBottom({ animation: "instant" });
	}, [chatId, scrollToBottom]);

	if (messages.length === 0) {
		return (
			<Center style={{ flex: 1, minHeight: 0 }} px="md">
				<Text size="sm" c="dimmed" ta="center">
					Ask a question to start a conversation.
				</Text>
			</Center>
		);
	}

	return (
		<ScrollArea
			viewportRef={scrollRef}
			offsetScrollbars
			style={{ flex: 1 }}>
			<Stack ref={contentRef} gap="sm">
				{messages.map(message => (
					<MessageBubble
						key={message.id}
						id={message.id}
						content={message.content}
						toolName={message.toolName}
						isStreaming={message.isStreaming}
						contextSnippets={message.contextSnippets}
						approval={message.approval}
						onToolApprovalResolved={onToolApprovalResolved}
					/>
				))}
			</Stack>
		</ScrollArea>
	);
}

export default ChatMessages;
